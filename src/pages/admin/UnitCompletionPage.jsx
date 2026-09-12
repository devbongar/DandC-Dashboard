import { useState, useRef, useEffect, useMemo } from 'react'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import AdminLayout from '../../components/AdminLayout'
import { supabase } from '../../lib/supabaseClient'
import SearchDropdown from '../../components/SearchDropdown'
import SheetMultiDropdown from '../../components/SheetMultiDropdown'

export default function UnitCompletionPage() {
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [allProjects, setAllProjects] = useState(null)
  const [is4ph,       setIs4ph]       = useState('all')
  const [projectIds,  setProjectIds]  = useState([])
  const [province,    setProvince]    = useState('')
  const [city,        setCity]        = useState('')
  const [timeMode,    setTimeMode]    = useState('monthly')
  const [filterDate,  setFilterDate]  = useState('')
  const filterRef = useRef(null)

  useEffect(() => {
    supabase.from('projects').select('id, name, is_4ph_project, province, city')
      .then(({ data }) => setAllProjects(data ?? []))
  }, [])

  const availableProvinces = useMemo(() => {
    if (!allProjects) return []
    return [...new Set(
      allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .map(p => p.province).filter(Boolean)
    )].sort()
  }, [allProjects, is4ph])

  const availableCities = useMemo(() => {
    if (!allProjects || !province) return []
    return [...new Set(
      allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .filter(p => p.province === province)
        .map(p => p.city).filter(Boolean)
    )].sort()
  }, [allProjects, is4ph, province])

  const activeFilterCount = [is4ph !== 'all', projectIds.length > 0, !!province, !!city, !!filterDate].filter(Boolean).length

  // Outside-click closes filter popover
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const headerActions = (
    <>
      {/* Search (decorative) */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search..."
          className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
        />
      </div>

      {/* Filter button + popover */}
      <div className="relative" ref={filterRef}>
        <button
          onClick={() => setFilterOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
          style={{
            background: filterOpen || activeFilterCount > 0 ? '#fff' : '#f9fafb',
            borderColor: activeFilterCount > 0 ? '#ed6055' : filterOpen ? '#ed6055' : '#e5e7eb',
            color: activeFilterCount > 0 ? '#ed6055' : '#6b7280',
            boxShadow: filterOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
              {activeFilterCount}
            </span>
          )}
        </button>
        {filterOpen && (
          <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-72 flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Type</p>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg w-full" style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}>
                {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                  <button key={t.key} onClick={() => { setIs4ph(t.key); setProjectIds([]); setProvince(''); setCity('') }}
                    className="relative flex-1 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                    style={is4ph === t.key ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)' } : { color: '#6b7280', background: 'transparent' }}
                  >{t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Project</p>
              <SheetMultiDropdown
                options={(allProjects ?? []).filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project)).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))}
                values={projectIds} onChange={setProjectIds}
                emptyLabel="All Projects" placeholder="Search projects..."
                icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Province</p>
              <SearchDropdown fluid
                options={availableProvinces.map(p => ({ value: p, label: p }))}
                value={province} onChange={v => { setProvince(v); setCity('') }} emptyValue="" emptyLabel="All Provinces" placeholder="Search provinces..."
                icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">City</p>
              <SearchDropdown fluid
                options={availableCities.map(c => ({ value: c, label: c }))}
                value={city} onChange={setCity} emptyValue="" emptyLabel="All Cities" placeholder="Search cities..."
                icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                disabled={!province || availableCities.length === 0}
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">As of Date</p>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border transition-all outline-none"
                style={{ borderColor: filterDate ? '#ed6055' : '#e5e7eb', color: filterDate ? '#111827' : '#9ca3af', boxShadow: filterDate ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)' }}
              />
              {filterDate && (
                <button onClick={() => setFilterDate('')} className="mt-1.5 text-[10px] font-semibold text-[#ed6055] hover:underline">Reset to all time</button>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setIs4ph('all'); setProjectIds([]); setProvince(''); setCity(''); setFilterDate('') }}
                className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )

  return (
    <AdminLayout title="Unit Completion Status" actions={headerActions}>
      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto">
          <UnitCompletionChart
            expanded
            is4ph={is4ph} setIs4ph={setIs4ph}
            projectIds={projectIds} setProjectIds={setProjectIds}
            province={province} setProvince={setProvince}
            city={city} setCity={setCity}
            timeMode={timeMode} setTimeMode={setTimeMode}
            filterDate={filterDate} setFilterDate={setFilterDate}
            allProjects={allProjects}
            availableProvinces={availableProvinces}
            availableCities={availableCities}
            activeFilterCount={activeFilterCount}
          />
        </div>
      </main>
    </AdminLayout>
  )
}
