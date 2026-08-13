import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { slugify } from './ProjectDetailPage'
import { supabase } from '../lib/supabaseClient'
import { isProjectCode } from '../lib/projectCode'
import DashboardLayout from '../components/DashboardLayout'
import useProfile from '../hooks/useProfile'
import LoadingScreen from '../components/LoadingScreen'
import useMinLoading from '../hooks/useMinLoading'
import TriangleLoader from '../components/TriangleLoader'
import { downloadWorkbook, parseWorkbook, toFloat } from '../lib/excelUtils'
import { PH_PROVINCES, PH_CITIES } from '../lib/philippinesLocations'
import ReportBuilderModal from '../components/ReportBuilderModal'
import SearchDropdown from '../components/SearchDropdown'

const PHASES = [
  { key: 'initiation',           label: 'Initiation',            color: '#94a3b8', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  { key: 'planning',             label: 'Planning',              color: '#64748b', badge: 'bg-slate-50 text-slate-600 border-slate-200' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring',color: '#ed6055', badge: 'bg-[#ed6055]/70 text-white border-[#ed6055]/70' },
  { key: 'closeout',             label: 'Close-Out',             color: '#22c55e', badge: 'bg-green-50 text-green-600 border-green-200' },
]
const PHASE_MAP   = Object.fromEntries(PHASES.map(p => [p.key, p]))


const BUSINESS_UNITS = [
  { code: 'FPI',    label: 'Famtech Properties Inc.' },
  { code: 'MDRI',   label: 'Megawide Dreamrise Residences Inc.' },
  { code: 'PCI',    label: 'Plushomes Inc.' },
  { code: 'PH1VEL', label: 'PH1VEL Properties Inc.' },
  { code: 'PH1',    label: 'PH1 World Developers Inc.' },
  { code: 'PH1L',   label: 'PH1 World Landscapes Inc.' },
]

// Normalise legacy full-name values → code for export
const BU_LABEL_TO_CODE = Object.fromEntries(
  BUSINESS_UNITS.flatMap(u => [
    [u.label.toLowerCase(), u.code],
    [u.label.toLowerCase().replace(/\.$/, ''), u.code],
  ])
)
const normaliseBU = val => {
  if (!val) return null
  const code = BUSINESS_UNITS.find(u => u.code === val)?.code
  if (code) return code
  return BU_LABEL_TO_CODE[val.toLowerCase()] ?? val
}

const EMPTY_FORM = { name: '', project_code: '', is_4ph_project: false, business_unit: '', province: '', city: '', lot_area: '', developable_area: '', development_type: '', num_floors: '', num_units: '', phase: '', project_brief: '' }

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '--'

const toThumbUrl = (url, width = 600) => {
  if (!url) return null
  return url.replace('/storage/v1/object/', '/storage/v1/render/image/') + `?width=${width}&quality=70`
}

const EXPORT_COLS = [
  { key: 'name',             header: 'Project Name' },
  { key: 'project_code',     header: 'Project Short Name' },
  { key: 'is_4ph_project',   header: 'Is 4PH Project' },
  { key: 'business_unit',    header: 'Business Unit' },
  { key: 'province',         header: 'Province' },
  { key: 'city',             header: 'City' },
  { key: 'lot_area',         header: 'Lot Area (sqm)' },
  { key: 'developable_area', header: 'Developable Area (sqm)' },
  { key: 'development_type', header: 'Development Type' },
  { key: 'num_floors',       header: 'Number of Floors' },
  { key: 'num_units',        header: 'Number of Units' },
  { key: 'phase',            header: 'Phase' },
  { key: 'description',      header: 'Description' },
]

function parseImportRow(row) {
  const get = key => {
    const found = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase())
    return found !== undefined ? row[found] : ''
  }
  const name = String(get('project name') ?? '').trim()
  if (!name) return null
  const raw4ph = String(get('is 4ph project') ?? '').toLowerCase().trim()
  const devType = String(get('development type') ?? '').toLowerCase().trim()
  const phaseRaw = String(get('phase') ?? '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
  const buRaw = String(get('business unit') ?? '').trim().toUpperCase()
  const validCodes = ['FPI', 'MDRI', 'PCI', 'PH1VEL', 'PH1', 'PH1L']
  const development_type = ['housing', 'condominium'].includes(devType) ? devType : null
  const rawFloors = get('number of floors')
  const rawUnits  = get('number of units')
  return {
    name,
    project_code:     String(get('project code') ?? '').trim() || null,
    is_4ph_project:   ['yes', 'true', '1'].includes(raw4ph),
    business_unit:    validCodes.includes(buRaw) ? buRaw : (String(get('business unit') ?? '').trim() || null),
    province:         String(get('province') ?? '').trim()         || null,
    city:             String(get('city') ?? '').trim()             || null,
    lot_area:         toFloat(get('lot area (sqm)')),
    developable_area: toFloat(get('developable area (sqm)')),
    development_type,
    num_floors:       development_type === 'condominium' && rawFloors !== '' ? parseInt(rawFloors) || null : null,
    num_units:        development_type === 'condominium' && rawUnits  !== '' ? parseInt(rawUnits)  || null : null,
    phase:            ['initiation', 'planning', 'execution_monitoring', 'closeout'].includes(phaseRaw) ? phaseRaw : null,
    description:      String(get('description') ?? '').trim()      || null,
  }
}


export default function ProjectsPage() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]               = useState('')
  const [phaseFilter, setPhaseFilter]     = useState('all')
  const [is4phFilter, setIs4phFilter]     = useState('all')
  const [businessUnitFilter, setBusinessUnitFilter] = useState('all')
  const [devTypeFilter, setDevTypeFilter] = useState('all')
  const [sortOrder, setSortOrder]         = useState('asc')

  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)
  const [toast, setToast]           = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [showReportBuilder, setShowReportBuilder] = useState(false)
  const [showFilters, setShowFilters]   = useState(false)
  const [showActions, setShowActions]   = useState(false)
  const actionsRef = useRef(null)
  const importRef = useRef(null)

  useEffect(() => { fetchProjects() }, [])

  const fetchProjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) {
      setProjects(data)
    }
    setLoading(false)
  }

  // -- Filtering --------------------------------------------------------------
  const filtered = projects.filter(p => {
    const matchSearch  = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
    const matchPhase   = phaseFilter         === 'all' || p.phase            === phaseFilter
    const match4ph     = is4phFilter         === 'all' || (is4phFilter === 'yes' ? p.is_4ph_project : !p.is_4ph_project)
    const matchBU      = businessUnitFilter  === 'all' || p.business_unit    === businessUnitFilter
    const matchDevType = devTypeFilter       === 'all' || p.development_type === devTypeFilter
    return matchSearch && matchPhase && match4ph && matchBU && matchDevType
  }).sort((a, b) => {
    const cmp = a.name.localeCompare(b.name)
    return sortOrder === 'asc' ? cmp : -cmp
  })

  // -- CRUD ------------------------------------------------------------------
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const handleProjectUpdated = (updated) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const isCondo = form.development_type === 'condominium'
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
      num_floors:       isCondo && form.num_floors !== '' ? parseInt(form.num_floors) : null,
      num_units:        isCondo && form.num_units  !== '' ? parseInt(form.num_units)  : null,
      phase:            form.phase || null,
      project_brief:    form.project_brief.trim() || null,
    }

    if ([payload.lot_area, payload.developable_area, payload.num_floors, payload.num_units].filter(v => v !== null).some(v => v < 0)) {
      showToast('Values cannot be negative.', 'error'); setSubmitting(false); return
    }
    const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()

    setSubmitting(false)
    if (error) { showToast('Error: ' + error.message, 'error'); return }

    if (!inserted?.id || !isProjectCode(inserted.id)) {
      showToast('Unexpected project ID format returned from server. Check that the migration and trigger are applied.', 'error')
      return
    }

    if (payload.development_type === 'condominium' && payload.num_floors > 0) {
      const floorRows = Array.from({ length: payload.num_floors }, (_, i) => ({
        project_id: inserted.id,
        physical_level: String(i + 1),
      }))
      await supabase.from('project_floors').insert(floorRows)
    }

    showToast('Project added.', 'success')
    setShowForm(false)
    fetchProjects()
  }

  const confirmDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('projects').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast('Project deleted.', 'success')
    setDeleteTarget(null)
    fetchProjects()
  }

  const showToast = (message, type) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleExport = async () => {
    const rows = projects.map(p => ({
      ...p,
      is_4ph_project: p.is_4ph_project ? 'Yes' : 'No',
      business_unit:  normaliseBU(p.business_unit),
    }))
    await downloadWorkbook([{ sheetName: 'Projects', rows, columns: EXPORT_COLS }], 'projects.xlsx')
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const wb = await parseWorkbook(file)
      const sheetName = Object.keys(wb)[0]
      const payloads = (wb[sheetName] ?? []).map(parseImportRow).filter(Boolean)
      if (!payloads.length) { showToast('No valid rows found in file.', 'error'); setImporting(false); return }

      const added   = []
      const errors  = []
      const skipped = []

      for (const payload of payloads) {
        const isDuplicate = projects.some(p =>
          p.name?.toLowerCase().trim()         === payload.name?.toLowerCase().trim() &&
          (p.project_code  || null)            === (payload.project_code  || null) &&
          (p.business_unit || null)            === (payload.business_unit || null)
        )
        if (isDuplicate) { skipped.push(payload.name); continue }

        if (payload.development_type === 'condominium') {
          const missing = []
          if (!payload.num_floors) missing.push('Number of Floors')
          if (!payload.num_units)  missing.push('Number of Units')
          if (missing.length) {
            errors.push({ name: payload.name, reason: `Condominium project requires: ${missing.join(', ')}.` })
            continue
          }
        }

        const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()
        if (error) {
          errors.push({ name: payload.name, reason: error.message })
        } else if (!inserted?.id || !isProjectCode(inserted.id)) {
          errors.push({ name: payload.name, reason: 'Server returned unexpected ID format. Check migration.' })
        } else {
          added.push(payload.name)
          if (payload.development_type === 'condominium' && payload.num_floors > 0) {
            const floorRows = Array.from({ length: payload.num_floors }, (_, i) => ({
              project_id: inserted.id,
              physical_level: String(i + 1),
            }))
            await supabase.from('project_floors').insert(floorRows)
          }
        }
      }

      setImportResults({ added, skipped, errors })
      if (added.length > 0) fetchProjects()
    } catch (err) {
      showToast('Failed to parse file: ' + err.message, 'error')
    }
    setImporting(false)
  }

  const showLoading = useMinLoading(profileLoading)
  if (showLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#ed6055]" />
          <div>
            <h1 className="text-2xl font-bold text-black">Projects</h1>
            <p className="text-gray-500 text-sm mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
          </div>
        </div>
        <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
      </div>

      {/* Filters */}
      {(() => {
        const activeCount = [
          phaseFilter !== 'all' ? phaseFilter : '',
          businessUnitFilter !== 'all' ? businessUnitFilter : '',
          devTypeFilter !== 'all' ? devTypeFilter : '',
          is4phFilter !== 'all' ? is4phFilter : '',
        ].filter(Boolean).length

        return (
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white"
              />
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition ${showFilters || activeCount > 0 ? 'border-[#ed6055] text-[#ed6055] bg-[#ed6055]/5' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
                Filters
                {activeCount > 0 && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold">{activeCount}</span>
                )}
              </button>
              {activeCount > 0 && (
                <button
                  onClick={() => { setPhaseFilter('all'); setBusinessUnitFilter('all'); setDevTypeFilter('all'); setIs4phFilter('all') }}
                  className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  Clear
                </button>
              )}
              {/* Actions dropdown */}
              <div className="relative flex-shrink-0" ref={actionsRef}>
                <button
                  onClick={() => setShowActions(v => !v)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-[#ed6055]/5 hover:border-[#ed6055]/30 hover:text-[#ed6055] text-gray-600 text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  Actions
                </button>
                {showActions && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowActions(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1.5 min-w-[160px]">
                      {projects.length > 0 && (
                        <button
                          onClick={() => { setShowReportBuilder(true); setShowActions(false) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                          Report
                        </button>
                      )}
                      {projects.length > 0 && (
                        <button
                          onClick={() => { handleExport(); setShowActions(false) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                          <DownloadIcon /> Export
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => { importRef.current?.click(); setShowActions(false) }}
                            disabled={importing}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            <UploadIcon /> {importing ? 'Importing…' : 'Import'}
                          </button>
                          <div className="my-1 border-t border-gray-100" />
                          <button
                            onClick={() => { openAdd(); setShowActions(false) }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#ed6055] hover:bg-[#ed6055]/5 transition"
                          >
                            <PlusIcon /> Add Project
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="mt-2 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <SearchDropdown
                    fluid
                    options={PHASES.map(p => ({ value: p.key, label: p.label }))}
                    value={phaseFilter}
                    onChange={setPhaseFilter}
                    emptyValue="all"
                    emptyLabel="All Phases"
                    placeholder="Search phases…"
                  />
                  <SearchDropdown
                    fluid
                    options={BUSINESS_UNITS.map(u => ({ value: u.code, label: u.code }))}
                    value={businessUnitFilter}
                    onChange={setBusinessUnitFilter}
                    emptyValue="all"
                    emptyLabel="All Business Units"
                    placeholder="Search units…"
                  />
                  <SearchDropdown
                    fluid
                    options={[{ value: 'housing', label: 'Housing' }, { value: 'condominium', label: 'Condominium' }]}
                    value={devTypeFilter}
                    onChange={setDevTypeFilter}
                    emptyValue="all"
                    emptyLabel="All Dev Types"
                    placeholder="Search types…"
                  />
                  <SearchDropdown
                    fluid
                    options={[{ value: 'yes', label: '4PH' }, { value: 'no', label: 'Non-4PH' }]}
                    value={is4phFilter}
                    onChange={setIs4phFilter}
                    emptyValue="all"
                    emptyLabel="All Types"
                    placeholder="Search…"
                  />
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Card grid */}
      {loading ? (
        <TriangleLoader label="Loading projects…" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          {projects.length === 0 ? (
            <>
              <p className="text-gray-400 text-sm mb-3">No projects yet.</p>
              {isAdmin && (
                <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition">
                  <PlusIcon /> Add your first project
                </button>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm">No projects match your filters.</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((project, idx) => {
              const ph = PHASE_MAP[project.phase]
              const phaseColor = ph?.color ?? '#94a3b8'
              const location = project.city && project.province
                ? `${project.city}, ${project.province}`
                : project.city || project.province || null

              return (
                <div
                  key={project.id}
                  onClick={() => navigate(`/projects/${slugify(project.project_code || project.name)}`, { state: { id: project.id } })}
                  className="group bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer flex flex-col select-none touch-manipulation"
                  style={{
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05)',
                    transition: 'transform 220ms cubic-bezier(0.23,1,0.32,1), box-shadow 220ms cubic-bezier(0.23,1,0.32,1)',
                    animation: 'ph1-fade-up 0.35s cubic-bezier(0.23,1,0.32,1) both',
                    animationDelay: `${Math.min(idx, 8) * 50}ms`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.14), 0 6px 16px rgba(0,0,0,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05)' }}
                >
                  {/* Card header image / color band */}
                  <div className="relative h-[480px] flex-shrink-0 overflow-hidden"
                    style={{ background: project.cover_photo_url ? '#f3f4f6' : `linear-gradient(135deg, ${phaseColor}18 0%, ${phaseColor}38 100%)` }}
                  >
                    {/* Subtle grid texture overlay */}
                    {!project.cover_photo_url && (
                      <div className="absolute inset-0 opacity-[0.03]"
                        style={{ backgroundImage: 'repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,#000 0px,#000 1px,transparent 1px,transparent 24px)' }}
                      />
                    )}
                    {project.cover_photo_url && (
                      <img
                        src={project.cover_photo_thumb_url || project.cover_photo_url}
                        onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = project.cover_photo_url }}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                      />
                    )}
                    {/* Bottom gradient overlay */}
                    <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />
                    {/* Phase accent bar at bottom of header */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: phaseColor }} />
                    {/* Phase badge */}
                    {ph && (
                      <span className={`absolute top-3 right-3 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border backdrop-blur-sm ${ph.badge}`}>
                        {ph.label}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col gap-3 p-4 flex-1">

                    {/* Row 1: Project name */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${phaseColor}15` }}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: phaseColor }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{project.name}</p>
                      </div>
                    </div>

                    {/* Row 2: Business unit */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 font-medium truncate">{project.business_unit || <span className="text-gray-300 italic font-normal">Not set</span>}</p>
                      </div>
                    </div>

                    {/* Row 3: Project brief */}
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 line-clamp-4 leading-relaxed">
                          {project.project_brief || <span className="text-gray-300 italic">No brief added</span>}
                        </p>
                      </div>
                    </div>

                    {/* Row 4: Lot area + dev type + location */}
                    <div className="mt-auto pt-3 border-t border-gray-50 flex flex-wrap gap-x-4 gap-y-1.5">
                      {project.lot_area && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                          </svg>
                          <span className="text-xs text-gray-500">{Number(project.lot_area).toLocaleString()} sqm</span>
                        </div>
                      )}
                      {location && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="text-xs text-gray-500 truncate">{location}</span>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-4 text-right">{filtered.length} of {projects.length} shown</p>
        </>
      )}
      </div>

      {/* -- Report Builder -- */}
      {showReportBuilder && (
        <ReportBuilderModal
          onClose={() => setShowReportBuilder(false)}
          defaultScope="all_projects"
        />
      )}

      {/* -- Add / Edit Modal -- */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl z-10 overflow-y-auto max-h-[90vh]">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100" style={{ borderTop: '4px solid #ed6055' }}>
              <h3 className="text-lg font-bold text-black">Add Project</h3>
              <p className="text-sm text-gray-400 mt-0.5">Fill in the details for the new project.</p>
            </div>
            <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-5">

              {/* Buttons top-right */}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting || !form.name.trim()} className="px-3 py-1.5 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition disabled:opacity-60">
                  {submitting ? 'Adding…' : 'Add Project'}
                </button>
              </div>

              {/* Project Brief card */}
              <div className="bg-gray-50 rounded-xl px-4 py-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Project Brief</p>
                <textarea
                  value={form.project_brief}
                  onChange={e => setForm(f => ({ ...f, project_brief: e.target.value }))}
                  rows={4}
                  placeholder="Write a summary of the project -- scope, objectives, key details, stakeholders…"
                  className={`${inputCls} resize-y`}
                />
              </div>

              {/* Project Details card */}
              <div className="bg-gray-50 rounded-xl px-4 py-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Project Details</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                  <FormField label="Project Name" required>
                    <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tower Block A" className={inputCls} />
                  </FormField>
                  <FormField label="Project Short Name">
                    <input value={form.project_code} onChange={e => setForm(f => ({ ...f, project_code: e.target.value }))} placeholder="e.g. PRJ-001" className={inputCls} />
                  </FormField>
                  <FormField label="4PH Project">
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        id="is_4ph"
                        type="checkbox"
                        checked={form.is_4ph_project}
                        onChange={e => setForm(f => ({ ...f, is_4ph_project: e.target.checked }))}
                        className="accent-[#ed6055] w-4 h-4"
                      />
                      <label htmlFor="is_4ph" className="text-sm text-gray-600 cursor-pointer select-none">Yes</label>
                    </div>
                  </FormField>
                  <FormField label="Business Unit">
                    <select value={form.business_unit} onChange={e => setForm(f => ({ ...f, business_unit: e.target.value }))} className={inputCls}>
                      <option value="">-- Select --</option>
                      {BUSINESS_UNITS.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Development Type">
                    <select value={form.development_type} onChange={e => setForm(f => ({ ...f, development_type: e.target.value, num_floors: '', num_units: '' }))} className={inputCls}>
                      <option value="">-- Select --</option>
                      <option value="housing">Housing</option>
                      <option value="condominium">Condominium</option>
                    </select>
                  </FormField>
                  <FormField label="Province">
                    <select value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value, city: '' }))} className={inputCls}>
                      <option value="">-- Select --</option>
                      {PH_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FormField>
                  <FormField label="City / Municipality">
                    <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} disabled={!form.province} className={`${inputCls} ${!form.province ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <option value="">-- Select --</option>
                      {(PH_CITIES[form.province] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Project Lot Area (sqm)">
                    <input type="number" min="0" step="0.01" value={form.lot_area} onChange={e => setForm(f => ({ ...f, lot_area: e.target.value }))} placeholder="0" className={`${inputCls} ${form.lot_area !== '' && Number(form.lot_area) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
                  </FormField>
                  <FormField label="Project Developable Area (sqm)">
                    <input type="number" min="0" step="0.01" value={form.developable_area} onChange={e => setForm(f => ({ ...f, developable_area: e.target.value }))} placeholder="0" className={`${inputCls} ${form.developable_area !== '' && Number(form.developable_area) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
                  </FormField>
                  <FormField label="Phase">
                    <select value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value }))} className={inputCls}>
                      <option value="">-- Select --</option>
                      {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </FormField>
                  {form.development_type === 'condominium' && (
                    <>
                      <FormField label="Number of Floors" required>
                        <input required type="number" min="1" step="1" value={form.num_floors} onChange={e => setForm(f => ({ ...f, num_floors: e.target.value }))} placeholder="e.g. 20" className={`${inputCls} ${form.num_floors !== '' && Number(form.num_floors) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
                      </FormField>
                      <FormField label="Number of Units" required>
                        <input required type="number" min="1" step="1" value={form.num_units} onChange={e => setForm(f => ({ ...f, num_units: e.target.value }))} placeholder="e.g. 500" className={`${inputCls} ${form.num_units !== '' && Number(form.num_units) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
                      </FormField>
                    </>
                  )}
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* -- Delete Confirm -- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
            <h3 className="text-lg font-bold text-black mb-1">Delete Project?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-semibold text-black">"{deleteTarget.name}"</span> will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Import Results Modal -- */}
      {importResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setImportResults(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-4 ${importResults.added.length > 0 ? 'bg-green-50' : 'bg-[#ed6055]/10'}`}>
              {importResults.added.length > 0
                ? <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                : <svg className="w-5 h-5 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              }
            </div>
            <h3 className="text-base font-bold text-black mb-1">Import Results</h3>
            <div className="flex gap-4 mb-3 text-sm">
              <span className="font-semibold text-green-600">{importResults.added.length} added</span>
              {importResults.skipped.length > 0 && <span className="font-semibold text-amber-500">{importResults.skipped.length} skipped</span>}
              {importResults.errors.length  > 0 && <span className="font-semibold text-[#ed6055]">{importResults.errors.length} failed</span>}
            </div>
            {importResults.added.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-32 overflow-y-auto mb-3 space-y-1">
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Added</p>
                {importResults.added.map((name, i) => (
                  <p key={i} className="text-xs text-green-700">{name}</p>
                ))}
              </div>
            )}
            {importResults.skipped.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-32 overflow-y-auto mb-3 space-y-1">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Skipped -- already exists</p>
                {importResults.skipped.map((name, i) => (
                  <p key={i} className="text-xs text-amber-700">{name}</p>
                ))}
              </div>
            )}
            {importResults.errors.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto mb-4 space-y-1.5">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Failed</p>
                {importResults.errors.map((e, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-semibold text-black">{e.name}</span>
                    <span className="text-gray-400 ml-1">-- {e.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setImportResults(null)} className="w-full py-2.5 rounded-xl bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[60] ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}
          style={{ animation: 'ph1-fade-up 0.2s ease-out both' }}
        >
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  )
}


function FormField({ label, required, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        {label}{required && <span className="text-[#ed6055] ml-0.5">*</span>}
      </p>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition bg-white'

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
)
const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
)
const UploadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)
const PencilIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)
