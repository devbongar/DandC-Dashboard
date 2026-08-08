import { useState, useEffect, useMemo } from 'react'
import { fetchProjectsBasic, fetchReportData } from '../lib/reportData'
import { generateOpsReport, generateMgmtExcel } from '../lib/opsReport'
import ManagementReportView from './ManagementReportView'

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

const btnBase = 'px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer'
const btnPrimary = `${btnBase} bg-[#ed6055] hover:bg-[#d94f45] text-white disabled:opacity-50 disabled:cursor-not-allowed`
const btnSecondary = `${btnBase} border border-gray-200 bg-white hover:bg-gray-50 text-gray-700`

function OptionCard({ label, description, selected, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition ${selected ? 'border-[#ed6055] bg-[#ed6055]/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[#ed6055] text-white' : 'bg-gray-100 text-gray-500'}`}>
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className={`text-sm font-semibold ${selected ? 'text-[#ed6055]' : 'text-gray-800'}`}>{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      {selected && (
        <div className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-[#ed6055] text-white flex items-center justify-center mt-0.5">
          <CheckIcon />
        </div>
      )}
    </button>
  )
}

export default function ReportBuilderModal({ onClose, defaultProject = null, defaultScope = 'all_projects' }) {
  const [reportType,        setReportType]        = useState('management')
  const [scope,             setScope]             = useState(defaultProject ? 'this_project' : defaultScope)
  const [format,            setFormat]            = useState('pdf')
  const [allProjects,       setAllProjects]       = useState([])
  const [selectedIds,       setSelectedIds]       = useState(new Set(defaultProject ? [defaultProject.id] : []))
  const [projectSearch,     setProjectSearch]     = useState('')
  const [loadingProjects,   setLoadingProjects]   = useState(false)
  const [generating,        setGenerating]        = useState(false)
  const [error,             setError]             = useState(null)
  const [reportData,        setReportData]        = useState(null)

  // Load all projects when "Select Projects" is chosen
  useEffect(() => {
    if (scope !== 'select_projects') return
    if (allProjects.length > 0) return
    setLoadingProjects(true)
    fetchProjectsBasic()
      .then(ps => setAllProjects(ps))
      .finally(() => setLoadingProjects(false))
  }, [scope])

  // Auto-switch format based on report type defaults
  useEffect(() => {
    if (reportType === 'management') setFormat('pdf')
    else setFormat('excel')
  }, [reportType])

  const filteredProjects = useMemo(() => {
    const q = projectSearch.toLowerCase()
    return q ? allProjects.filter(p => (p.name ?? '').toLowerCase().includes(q) || (p.project_code ?? '').toLowerCase().includes(q)) : allProjects
  }, [allProjects, projectSearch])

  const toggleProject = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)
    try {
      let ids
      if (scope === 'this_project') {
        if (!defaultProject) throw new Error('No project selected.')
        ids = [defaultProject.id]
      } else if (scope === 'select_projects') {
        if (selectedIds.size === 0) { setError('Select at least one project.'); setGenerating(false); return }
        ids = [...selectedIds]
      } else {
        // all_projects -- load full list if not yet loaded
        const ps = allProjects.length > 0 ? allProjects : await fetchProjectsBasic()
        ids = ps.map(p => p.id)
      }

      const data = await fetchReportData(ids)

      if (format === 'pdf') {
        setReportData(data)
      } else {
        if (reportType === 'ops') {
          await generateOpsReport(data)
        } else {
          await generateMgmtExcel(data)
        }
        onClose()
      }
    } catch (e) {
      console.error('Report generation error:', e)
      setError(`Failed to generate report: ${e?.message || e?.toString() || 'Unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  // Show report preview
  if (reportData) {
    return <ManagementReportView data={reportData} onClose={onClose} />
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Report Builder</h2>
            <p className="text-xs text-gray-500 mt-0.5">Configure and generate your report</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition">
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Report Type */}
          <div>
            <label className="block text-xs font-700 text-gray-500 uppercase tracking-wider mb-2.5">Report Type</label>
            <div className="grid grid-cols-2 gap-2">
              <OptionCard
                label="Management"
                description="Executive summary with KPIs and status overview"
                selected={reportType === 'management'}
                onClick={() => setReportType('management')}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
              />
              <OptionCard
                label="Ops Team"
                description="Detailed data: completion, permits, milestones, issues"
                selected={reportType === 'ops'}
                onClick={() => setReportType('ops')}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
              />
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-700 text-gray-500 uppercase tracking-wider mb-2.5">Scope</label>
            <div className="flex flex-col gap-2">
              {defaultProject && (
                <OptionCard
                  label="This Project"
                  description={defaultProject.name ?? defaultProject.project_name ?? 'Current project'}
                  selected={scope === 'this_project'}
                  onClick={() => setScope('this_project')}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                />
              )}
              <OptionCard
                label="Select Projects"
                description="Choose specific projects to include"
                selected={scope === 'select_projects'}
                onClick={() => setScope('select_projects')}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
              />
              <OptionCard
                label="All Projects"
                description="Include all projects in the database"
                selected={scope === 'all_projects'}
                onClick={() => setScope('all_projects')}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
              />
            </div>
          </div>

          {/* Project Picker (when Select Projects) */}
          {scope === 'select_projects' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-700 text-gray-500 uppercase tracking-wider">Projects</label>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-[#ed6055] font-semibold">{selectedIds.size} selected</span>
                )}
              </div>
              {loadingProjects ? (
                <div className="text-sm text-gray-400 text-center py-6">Loading projects…</div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></span>
                    <input
                      type="text"
                      placeholder="Search projects…"
                      value={projectSearch}
                      onChange={e => setProjectSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {filteredProjects.length === 0 ? (
                      <div className="text-sm text-gray-400 text-center py-4">No projects found</div>
                    ) : (
                      filteredProjects.map(p => {
                        const checked = selectedIds.has(p.id)
                        return (
                          <label key={p.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0 ${checked ? 'bg-[#ed6055]/5' : ''}`}>
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#ed6055] border-[#ed6055]' : 'border-2 border-gray-300'}`}>
                              {checked && <CheckIcon />}
                            </div>
                            <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleProject(p.id)} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                              {p.project_code && <div className="text-xs text-gray-400">{p.project_code}</div>}
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                  {selectedIds.size > 0 && (
                    <button onClick={() => setSelectedIds(new Set())} className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition">Clear selection</button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Format */}
          <div>
            <label className="block text-xs font-700 text-gray-500 uppercase tracking-wider mb-2.5">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <OptionCard
                label="PDF"
                description="Print-ready report for presentations"
                selected={format === 'pdf'}
                onClick={() => setFormat('pdf')}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              />
              <OptionCard
                label="Excel"
                description="Spreadsheet for data analysis and ops"
                selected={format === 'excel'}
                onClick={() => setFormat('excel')}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>}
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className={btnSecondary}>Cancel</button>
          <button onClick={handleGenerate} disabled={generating} className={btnPrimary}>
            {generating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Generating…
              </span>
            ) : (
              `Generate ${format === 'pdf' ? 'PDF' : 'Excel'}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
