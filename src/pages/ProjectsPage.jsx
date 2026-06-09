import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import DashboardLayout from '../components/DashboardLayout'
import useProfile from '../hooks/useProfile'
import LoadingScreen from '../components/LoadingScreen'
import useMinLoading from '../hooks/useMinLoading'
import ProjectDetailModal from '../components/ProjectDetailModal'
import TriangleLoader from '../components/TriangleLoader'
import { downloadWorkbook, parseWorkbook, toFloat } from '../lib/excelUtils'
import { PH_PROVINCES, PH_CITIES } from '../lib/philippinesLocations'

const PHASES = [
  { key: 'initiation',           label: 'Initiation',            color: '#94a3b8', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  { key: 'planning',             label: 'Planning',              color: '#3b82f6', badge: 'bg-blue-50 text-blue-600 border-blue-200' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring',color: '#ed6055', badge: 'bg-[#ed6055]/10 text-[#ed6055] border-[#ed6055]/20' },
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

const EMPTY_FORM = { name: '', project_code: '', is_4ph_project: false, business_unit: '', province: '', city: '', lot_area: '', developable_area: '', development_type: '', num_floors: '', num_units: '', phase: '' }

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const EXPORT_COLS = [
  { key: 'name',             header: 'Project Name' },
  { key: 'project_code',     header: 'Project Code' },
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

  const [selected, setSelected]     = useState(null)
  const [selectedInEdit, setSelectedInEdit] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)
  const [toast, setToast]           = useState(null)
  const [importing, setImporting]   = useState(false)
  const [importResults, setImportResults] = useState(null)
  const importRef = useRef(null)

  useEffect(() => { fetchProjects() }, [])

  const fetchProjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setProjects(data)
    setLoading(false)
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
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

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const handleProjectUpdated = (updated) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    if (selected?.id === updated.id) setSelected(updated)
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
    }

    if ([payload.lot_area, payload.developable_area, payload.num_floors, payload.num_units].filter(v => v !== null).some(v => v < 0)) {
      showToast('Values cannot be negative.', 'error'); setSubmitting(false); return
    }
    const { data: inserted, error } = await supabase.from('projects').insert(payload).select('id').single()

    setSubmitting(false)
    if (error) { showToast('Error: ' + error.message, 'error'); return }

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
    if (selected?.id === deleteTarget.id) setSelected(null)
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Export */}
          {projects.length > 0 && (
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-[#ed6055]/5 hover:border-[#ed6055]/30 hover:text-[#ed6055] text-gray-600 text-sm font-semibold transition">
              <DownloadIcon /> Export
            </button>
          )}
          {isAdmin && (
            <>
              {/* Import */}
              <button onClick={() => importRef.current?.click()} disabled={importing} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-[#ed6055]/5 hover:border-[#ed6055]/30 hover:text-[#ed6055] text-gray-600 text-sm font-semibold transition disabled:opacity-50">
                <UploadIcon /> {importing ? 'Importing…' : 'Import'}
              </button>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              {/* Add */}
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition">
                <PlusIcon /> Add Project
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white"
        />
        <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent">
          <option value="all">All Phases</option>
          {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <TriangleLoader label="Loading projects…" />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {projects.length === 0 ? 'No projects yet.' : 'No projects match your filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {/* No. */}
                  <th className="text-center px-3 py-3 bg-gray-50/80 whitespace-nowrap w-10">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">No.</span>
                  </th>
                  {/* Project Name — sortable */}
                  <th className="text-left px-5 py-3 bg-gray-50/80 whitespace-nowrap">
                    <button
                      onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-black transition group"
                    >
                      Project Name
                      <span className="flex flex-col gap-[1px] opacity-50 group-hover:opacity-100 transition">
                        <svg className={`w-2.5 h-2.5 ${sortOrder === 'asc' ? 'text-[#ed6055]' : 'text-gray-400'}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L0 6h10z"/></svg>
                        <svg className={`w-2.5 h-2.5 ${sortOrder === 'desc' ? 'text-[#ed6055]' : 'text-gray-400'}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L10 0H0z"/></svg>
                      </span>
                    </button>
                  </th>

                  {/* Business Unit — filterable */}
                  <th className="text-left px-5 py-3 bg-gray-50/80 whitespace-nowrap">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Business Unit</span>
                      <select
                        value={businessUnitFilter}
                        onChange={e => setBusinessUnitFilter(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] font-normal normal-case tracking-normal border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#ed6055] cursor-pointer"
                      >
                        <option value="all">All</option>
                        {BUSINESS_UNITS.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                      </select>
                    </div>
                  </th>

                  {/* Development Type — filterable */}
                  <th className="text-left px-5 py-3 bg-gray-50/80 whitespace-nowrap">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Development Type</span>
                      <select
                        value={devTypeFilter}
                        onChange={e => setDevTypeFilter(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] font-normal normal-case tracking-normal border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#ed6055] cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="housing">Housing</option>
                        <option value="condominium">Condominium</option>
                      </select>
                    </div>
                  </th>

                  {/* 4PH — filterable */}
                  <th className="text-left px-5 py-3 bg-gray-50/80 whitespace-nowrap">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">4PH</span>
                      <select
                        value={is4phFilter}
                        onChange={e => setIs4phFilter(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] font-normal normal-case tracking-normal border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#ed6055] cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="yes">4PH</option>
                        <option value="no">Non-4PH</option>
                      </select>
                    </div>
                  </th>

                  {/* Location */}
                  <th className="text-left px-5 py-3 bg-gray-50/80 whitespace-nowrap">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</span>
                  </th>

                  {/* Phase */}
                  <th className="text-left px-5 py-3 bg-gray-50/80 whitespace-nowrap">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Phase</span>
                  </th>

                  {isAdmin && (
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50/80">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((project, idx) => {
                  const phaseColor = PHASE_MAP[project.phase]?.color ?? '#e5e7eb'
                  return (
                  <tr
                    key={project.id}
                    onClick={() => setSelected(project)}
                    className="hover:bg-gray-50/60 transition cursor-pointer"
                    style={{ boxShadow: `inset 3px 0 0 ${phaseColor}` }}
                  >
                    <td className="px-3 py-4 text-center">
                      <span className="text-xs font-medium text-gray-400 tabular-nums">{idx + 1}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-black">{project.name}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs whitespace-nowrap">{project.business_unit || <span className="text-gray-300 italic">—</span>}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs whitespace-nowrap capitalize">
                      {project.development_type
                        ? project.development_type === 'housing' ? 'Housing' : 'Condominium'
                        : <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-4 text-xs whitespace-nowrap">
                      {project.is_4ph_project
                        ? <span className="font-semibold px-2.5 py-1 rounded-full bg-[#ed6055]/10 text-[#ed6055]">4PH</span>
                        : <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs whitespace-nowrap">
                      {project.city && project.province
                        ? `${project.city}, ${project.province}`
                        : project.city || project.province || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-5 py-4 text-xs whitespace-nowrap">
                      {project.phase
                        ? (() => {
                            const ph = PHASE_MAP[project.phase]
                            return (
                              <span
                                className={`inline-block font-semibold px-2.5 py-1 rounded-full border text-xs ${ph?.badge ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}
                              >
                                {ph?.label ?? project.phase}
                              </span>
                            )
                          })()
                        : <span className="text-gray-300 italic">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={e => { e.stopPropagation(); setSelected(project); setSelectedInEdit(true) }} className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition" title="Edit">
                            <PencilIcon />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget(project) }} className="p-1.5 rounded-lg text-gray-400 hover:text-[#ed6055] hover:bg-[#ed6055]/5 transition" title="Delete">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )})}

              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-right">{filtered.length} of {projects.length} shown</p>
      </div>

      {/* ── Project Detail Modal ── */}
      {selected && (
        <ProjectDetailModal
          project={selected}
          isAdmin={isAdmin}
          onClose={() => { setSelected(null); setSelectedInEdit(false) }}
          onProjectUpdated={handleProjectUpdated}
          startEditing={selectedInEdit}
        />
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg z-10 overflow-y-auto max-h-[90vh]">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100" style={{ borderTop: '4px solid #ed6055' }}>
              <h3 className="text-lg font-bold text-black">Add Project</h3>
              <p className="text-sm text-gray-400 mt-0.5">Fill in the details for the new project.</p>
            </div>
            <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Project Name" required>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tower Block A" className={inputCls} />
                </FormField>
                <FormField label="Project Code">
                  <input value={form.project_code} onChange={e => setForm(f => ({ ...f, project_code: e.target.value }))} placeholder="e.g. PRJ-001" className={inputCls} />
                </FormField>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    id="is_4ph"
                    type="checkbox"
                    checked={form.is_4ph_project}
                    onChange={e => setForm(f => ({ ...f, is_4ph_project: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-[#ed6055] focus:ring-[#ed6055]"
                  />
                  <label htmlFor="is_4ph" className="text-sm font-medium text-gray-700 cursor-pointer select-none">4PH Project</label>
                </div>
                <FormField label="Business Unit">
                  <select value={form.business_unit} onChange={e => setForm(f => ({ ...f, business_unit: e.target.value }))} className={inputCls}>
                    <option value="">— Select Business Unit —</option>
                    {BUSINESS_UNITS.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                  </select>
                </FormField>
                <FormField label="Province">
                  <select value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value, city: '' }))} className={inputCls}>
                    <option value="">— Select Province —</option>
                    {PH_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </FormField>
                <FormField label="City / Municipality">
                  <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} disabled={!form.province} className={`${inputCls} ${!form.province ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <option value="">— Select City —</option>
                    {(PH_CITIES[form.province] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
                <FormField label="Project Lot Area (sqm)">
                  <input type="number" min="0" step="0.01" value={form.lot_area} onChange={e => setForm(f => ({ ...f, lot_area: e.target.value }))} placeholder="e.g. 5000" className={`${inputCls} ${form.lot_area !== '' && Number(form.lot_area) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
                </FormField>
                <FormField label="Project Developable Area (sqm)">
                  <input type="number" min="0" step="0.01" value={form.developable_area} onChange={e => setForm(f => ({ ...f, developable_area: e.target.value }))} placeholder="e.g. 4500" className={`${inputCls} ${form.developable_area !== '' && Number(form.developable_area) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
                </FormField>
                <FormField label="Development Type">
                  <select value={form.development_type} onChange={e => setForm(f => ({ ...f, development_type: e.target.value, num_floors: '', num_units: '' }))} className={inputCls}>
                    <option value="">— Select Type —</option>
                    <option value="housing">Housing</option>
                    <option value="condominium">Condominium</option>
                  </select>
                </FormField>
                {form.development_type === 'condominium' && (
                  <>
                    <FormField label="Number of Floors" required>
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={form.num_floors}
                        onChange={e => setForm(f => ({ ...f, num_floors: e.target.value }))}
                        placeholder="e.g. 20"
                        className={`${inputCls} ${form.num_floors !== '' && Number(form.num_floors) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`}
                      />
                    </FormField>
                    <FormField label="Number of Units" required>
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={form.num_units}
                        onChange={e => setForm(f => ({ ...f, num_units: e.target.value }))}
                        placeholder="e.g. 500"
                        className={`${inputCls} ${form.num_units !== '' && Number(form.num_units) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`}
                      />
                    </FormField>
                  </>
                )}
                <FormField label="Phase">
                  <select value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value }))} className={inputCls}>
                    <option value="">— Select Phase —</option>
                    {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition disabled:opacity-60">
                  {submitting ? 'Adding…' : 'Add Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
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

      {/* ── Import Results Modal ── */}
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
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Skipped — already exists</p>
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
                    <span className="text-gray-400 ml-1">— {e.reason}</span>
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
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-[#ed6055] ml-0.5">*</span>}
      </label>
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
