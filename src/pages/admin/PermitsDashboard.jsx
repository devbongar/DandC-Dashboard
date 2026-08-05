import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import PermitDetail from '../../components/PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../../lib/permitUtils'

const CARD_ICONS = {
  pending:     <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />,
  inProgress:  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />,
  acquired:    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />,
  overdue:     <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />,
  withIssues:  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />,
}

const CARDS = [
  { label: 'Pending',     key: 'pending',    filterKey: 'pending',     num: 'text-gray-900 dark:text-white', icon: 'text-gray-400 dark:text-gray-500', ring: 'ring-[#ed6055]', bg: '' },
  { label: 'In Progress', key: 'inProgress', filterKey: 'in-progress', num: 'text-gray-900 dark:text-white', icon: 'text-gray-400 dark:text-gray-500', ring: 'ring-[#ed6055]', bg: '' },
  { label: 'Acquired',    key: 'acquired',   filterKey: 'acquired',    num: 'text-gray-900 dark:text-white', icon: 'text-gray-400 dark:text-gray-500', ring: 'ring-[#ed6055]', bg: '' },
  { label: 'Overdue',     key: 'overdue',    filterKey: 'overdue',     num: 'text-gray-900 dark:text-white', icon: 'text-gray-400 dark:text-gray-500', ring: 'ring-[#ed6055]', bg: '' },
  { label: 'With Issues', key: 'withIssues', filterKey: 'with-issues', num: 'text-gray-900 dark:text-white', icon: 'text-gray-400 dark:text-gray-500', ring: 'ring-[#ed6055]', bg: '' },
]

function IssueIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400 drop-shadow-sm flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-label="Has open issues">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}

function SearchClearIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

export default function PermitsDashboard() {
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [permits,  setPermits]  = useState([])
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [filterProject, setFilterProject] = useState('all')
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [search,        setSearch]        = useState('')
  const [selected,      setSelected]      = useState(null)

  const cardScrollRef = useRef(null)
  const [cardScrollPos, setCardScrollPos] = useState(0)

  function scrollCards(dir) {
    const el = cardScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 140, behavior: 'smooth' })
  }

  function onCardScroll() {
    setCardScrollPos(cardScrollRef.current?.scrollLeft ?? 0)
  }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: pData }, { data: projData }] = await Promise.all([
      supabase
        .from('permits')
        .select('*, projects(name), permit_requirements(id, is_complete), permit_issues(id, status)')
        .order('created_at', { ascending: false }),
      supabase
        .from('projects')
        .select('id, name')
        .order('name'),
    ])
    setPermits(pData ?? [])
    setProjects(projData ?? [])
    setLoading(false)
  }

  const rows = permits.filter(p => {
    const effectiveStatus = computePermitStatus(p)
    const hasIssue = (p.permit_issues ?? []).some(i => i.status === 'open')
    const matchProject = filterProject === 'all' || p.project_id === filterProject
    const matchStatus  = filterStatus === 'all'
      ? true
      : filterStatus === 'with-issues'
        ? hasIssue
        : effectiveStatus === filterStatus
    const q = search.toLowerCase()
    const matchSearch  = !q ||
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

  const hasActiveFilter = filterStatus !== 'all' || filterProject !== 'all' || search !== ''

  function clearFilters() {
    setFilterStatus('all')
    setFilterProject('all')
    setSearch('')
  }

  if (loading || profileLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Permits Monitoring</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">All permits across all projects</p>
        </div>

        {/* Summary cards */}
        <div className="relative -mx-4 sm:mx-0">
          <div
            ref={cardScrollRef}
            onScroll={onCardScroll}
            className="flex gap-3 overflow-x-auto py-2 px-4 sm:grid sm:grid-cols-5 sm:overflow-visible sm:py-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {CARDS.map(c => {
              const active = filterStatus === c.filterKey
              return (
                <button
                  key={c.label}
                  onClick={() => setFilterStatus(active && c.filterKey !== 'all' ? 'all' : c.filterKey)}
                  className={`flex-none w-28 sm:w-auto text-left rounded-xl border p-3 sm:p-4 transition-[transform,box-shadow] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/60 ${c.bg} ${
                    active
                      ? `bg-white dark:bg-gray-800 border-transparent ring-2 ${c.ring} shadow-md`
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex flex-col items-center text-center gap-1">
                    <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${c.icon}`} viewBox="0 0 20 20" fill="currentColor">
                      {CARD_ICONS[c.key]}
                    </svg>
                    <p className={`text-xl sm:text-2xl font-bold tabular-nums ${c.num}`}>{counts[c.key]}</p>
                    <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 leading-tight">{c.label}</p>
                  </div>
                </button>
              )
            })}
          </div>
          {/* Left fade + arrow — mobile only */}
          <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent sm:hidden transition-opacity duration-200 ${cardScrollPos > 8 ? 'opacity-100' : 'opacity-0'}`} />
          {cardScrollPos > 8 && (
            <button
              onClick={() => scrollCards(-1)}
              className="sm:hidden absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 active:scale-95 transition-transform"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {/* Right fade + arrow — mobile only */}
          <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent sm:hidden transition-opacity duration-200 ${cardScrollRef.current && cardScrollPos < cardScrollRef.current.scrollWidth - cardScrollRef.current.clientWidth - 8 ? 'opacity-100' : 'opacity-0'}`} />
          {cardScrollRef.current && cardScrollPos < cardScrollRef.current.scrollWidth - cardScrollRef.current.clientWidth - 8 && (
            <button
              onClick={() => scrollCards(1)}
              className="sm:hidden absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 active:scale-95 transition-transform"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[220px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search permits..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 focus:border-[#ed6055]/60 transition-shadow"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Clear search"
              >
                <SearchClearIcon />
              </button>
            )}
          </div>
          {/* Project dropdown */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M1 2.75A.75.75 0 011.75 2h10.5a.75.75 0 010 1.5H12v13.75a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-2.5a.75.75 0 00-.75-.75h-2.5a.75.75 0 00-.75.75v2.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.5h-.25A.75.75 0 011 2.75zM15 4.75a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM18.25 4a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5a.75.75 0 01.75-.75zM15 8.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM18.25 7.5a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5a.75.75 0 01.75-.75zM15 11.75a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM18.25 11a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5a.75.75 0 01.75-.75zM15 15.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM18.25 14.5a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5a.75.75 0 01.75-.75zM1.75 16.5a.75.75 0 000 1.5H19.25a.75.75 0 000-1.5H1.75z" clipRule="evenodd" />
            </svg>
            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              className="appearance-none pl-9 pr-8 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 focus:border-[#ed6055]/60 transition-shadow cursor-pointer"
            >
              <option value="all">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <SearchClearIcon />
              Clear filters
            </button>
          )}
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {rows.length === 0 && (
            <div className="py-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No permits found</p>
              {hasActiveFilter && (
                <button onClick={clearFilters} className="mt-2 text-xs text-[#ed6055] hover:underline">
                  Clear filters to see all permits
                </button>
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
            return Object.entries(map).map(([projectId, group]) => (
              <div key={projectId}>
                <div className="flex items-center gap-2 px-1 py-1.5">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{group.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">{group.permits.length}</span>
                </div>
                <div className="space-y-2">
                  {group.permits.map(permit => {
                    const status   = computePermitStatus(permit)
                    const reqs     = permit.permit_requirements ?? []
                    const reqTotal = reqs.length
                    const reqDone  = reqs.filter(r => r.is_complete).length
                    const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
                    const delayed  = permit.planned_finish && status !== 'acquired'
                      ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000))
                      : 0
                    return (
                      <button
                        key={permit.id}
                        onClick={() => setSelected(permit)}
                        className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 active:scale-[0.99] transition-[transform,box-shadow] shadow-sm hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">{permit.name}</span>
                              {hasIssue && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold flex-shrink-0">
                                  <IssueIcon />
                                  Issue
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">{permit.id}</p>
                          </div>
                          <span className={`flex-shrink-0 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {reqTotal > 0 && (
                            <span className={`text-xs ${reqDone === reqTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                              {reqDone}/{reqTotal} reqs
                            </span>
                          )}
                          {permit.planned_finish && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Planned {permit.planned_finish}</span>
                          )}
                          {delayed > 0 && (
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">{delayed}d delayed</span>
                          )}
                          {permit.responsible_person && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{permit.responsible_person}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          })()}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table meta row */}
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {rows.length} permit{rows.length !== 1 ? 's' : ''}
              {hasActiveFilter && <span className="ml-1 text-gray-400 dark:text-gray-500">(filtered)</span>}
            </span>
            {filterStatus !== 'all' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">
                {filterStatus.replace('-', ' ')}
              </span>
            )}
          </div>
          <div className="overflow-auto max-h-[calc(100vh-22rem)] scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-gray-700 dark:border-gray-600 bg-gray-700 dark:bg-gray-900">
                  {['Permit ID','Name','Status','Requirements','Days Delayed','Planned Finish','Forecast Finish','Responsible'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-200 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No permits found</p>
                      {hasActiveFilter && (
                        <button onClick={clearFilters} className="mt-2 text-xs text-[#ed6055] hover:underline">
                          Clear filters to see all permits
                        </button>
                      )}
                    </td>
                  </tr>
                )}
                {(() => {
                  const map = {}
                  for (const p of rows) {
                    const key = p.project_id
                    if (!map[key]) map[key] = { name: p.projects?.name ?? p.project_id, permits: [] }
                    map[key].permits.push(p)
                  }
                  return Object.entries(map).map(([projectId, group]) => (
                    <React.Fragment key={projectId}>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 border-t-2 border-b border-gray-200 dark:border-gray-700">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">{group.name}</span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                              {group.permits.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {group.permits.map(permit => {
                        const status   = computePermitStatus(permit)
                        const reqs     = permit.permit_requirements ?? []
                        const reqTotal = reqs.length
                        const reqDone  = reqs.filter(r => r.is_complete).length
                        const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
                        const delayed  = permit.planned_finish && status !== 'acquired'
                          ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000))
                          : 0
                        return (
                          <tr
                            key={permit.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors duration-150 border-b border-gray-100 dark:border-gray-700/40"
                            onClick={() => setSelected(permit)}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{permit.id}</td>
                            <td className="px-4 py-3 font-medium whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-900 dark:text-white">{permit.name}</span>
                                {hasIssue && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                                    <IssueIcon />
                                    Issue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
                                {status}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                              {reqTotal === 0
                                ? <span className="text-xs text-gray-400">—</span>
                                : <span className={`text-xs font-medium ${reqDone === reqTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {reqDone}/{reqTotal}
                                  </span>
                              }
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                              {delayed > 0
                                ? <span className="text-xs font-semibold text-red-600 dark:text-red-400">{delayed}d</span>
                                : <span className="text-xs text-gray-400">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">{permit.planned_finish ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">{permit.forecast_finish ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{permit.responsible_person ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={profile?.role === 'head'}
          currentUserId={profile?.id}
          onClose={() => setSelected(null)}
          onUpdated={fetchAll}
        />
      )}
    </DashboardLayout>
  )
}
