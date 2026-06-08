import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const STATUS_CONFIG = {
  open:  { label: 'Open',  className: 'bg-red-50 text-red-500' },
  close: { label: 'Close', className: 'bg-green-50 text-green-600' },
  hold:  { label: 'Hold',  className: 'bg-amber-50 text-amber-600' },
}

const EMPTY = { project_id: '', details: '', status: 'open' }

function TriangleLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="flex items-center gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 12, height: 12, background: '#ed6055',
            clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
            animation: 'ph1-loader-tri 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.22}s`,
          }} />
        ))}
      </div>
      <p className="text-xs text-gray-400">Loading ESA issues…</p>
    </div>
  )
}

export default function EsaIssuesTable({ canEdit = false }) {
  const [issues, setIssues]     = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [active, setActive]     = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)
  const [filterStatus, setFilterStatus]   = useState('all')
  const [filterProject, setFilterProject] = useState('all')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [issuesRes, projectsRes] = await Promise.all([
      supabase
        .from('esa_issues')
        .select('id, project_id, details, status, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
    ])
    if (issuesRes.data)   setIssues(issuesRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)
    setLoading(false)
  }

  const projectName = (id) => projects.find(p => p.id === id)?.name ?? '—'

  const openView   = (issue) => { setActive(issue); setModal('view') }
  const openAdd    = () => { setForm(EMPTY); setModal('add') }
  const openEdit   = (issue) => {
    setActive(issue)
    setForm({ project_id: issue.project_id ?? '', details: issue.details, status: issue.status })
    setModal('edit')
  }
  const openDelete = (issue) => { setActive(issue); setModal('delete') }
  const closeModal = () => { setModal(null); setActive(null) }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSave = async () => {
    if (!form.details.trim()) return
    setSaving(true)
    const payload = {
      project_id: form.project_id || null,
      details:    form.details.trim(),
      status:     form.status,
    }
    let error
    if (modal === 'add') {
      ({ error } = await supabase.from('esa_issues').insert([payload]))
    } else {
      ({ error } = await supabase.from('esa_issues').update(payload).eq('id', active.id))
    }
    setSaving(false)
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
    showToast(modal === 'add' ? 'ESA issue added.' : 'ESA issue updated.')
    closeModal()
    fetchAll()
  }

  const handleDelete = async () => {
    setSaving(true)
    const { error } = await supabase.from('esa_issues').delete().eq('id', active.id)
    setSaving(false)
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); return }
    showToast('ESA issue deleted.')
    closeModal()
    fetchAll()
  }

  const isOpen = modal === 'add' || modal === 'edit'

  const filtered = issues.filter(issue => {
    const matchStatus  = filterStatus  === 'all' || issue.status     === filterStatus
    const matchProject = filterProject === 'all' || issue.project_id === filterProject
    return matchStatus && matchProject
  })

  const hasActiveFilter = filterStatus !== 'all' || filterProject !== 'all'
  const clearFilters = () => { setFilterStatus('all'); setFilterProject('all') }

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#ed6055]" />
          <div>
            <h2 className="text-lg font-bold text-black leading-none">ESA Issues</h2>
            <p className="text-gray-400 text-xs mt-0.5">Track ESA-related project issues.</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-[#ed6055] text-white text-sm font-semibold rounded-lg hover:bg-[#d95248] transition"
          >
            <PlusIcon />
            Add ESA Issue
          </button>
        )}
      </div>

      {/* Filters */}
      {!loading && issues.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
              <option key={val} value={val}>{cfg.label}</option>
            ))}
          </select>
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 bg-white transition whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? <TriangleLoader /> : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {issues.length === 0 ? 'No ESA issues recorded yet.' : 'No ESA issues match the selected filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Project', 'Details', 'Status', ...(canEdit ? [''] : [])].map(h => (
                    <th key={h} className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/80">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(issue => {
                  const sc = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.open
                  return (
                    <tr
                      key={issue.id}
                      onClick={() => openView(issue)}
                      className="hover:bg-gray-50/50 transition cursor-pointer"
                      style={{ boxShadow: 'inset 3px 0 0 #ed6055' }}
                    >
                      <td className="px-6 py-4 font-medium text-black whitespace-nowrap">
                        {projectName(issue.project_id)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-xs">
                        <p className="line-clamp-2">{issue.details}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${sc.className}`}>
                          {sc.label}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => openEdit(issue)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                              title="Edit"
                            >
                              <PencilIcon />
                            </button>
                            <button
                              onClick={() => openDelete(issue)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                              title="Delete"
                            >
                              <TrashIcon />
                            </button>
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
      </div>

      {!loading && issues.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-right">
          {filtered.length} of {issues.length} ESA issue{issues.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Detail View Modal */}
      {modal === 'view' && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ borderTop: '4px solid #ed6055' }}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#ed6055] uppercase tracking-wider mb-1">ESA Issue Detail</p>
                <h3 className="text-base font-bold text-black leading-snug">
                  {projectName(active.project_id) !== '—' ? projectName(active.project_id) : 'No project linked'}
                </h3>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit && (
                  <>
                    <button
                      onClick={() => { closeModal(); setTimeout(() => openEdit(active), 0) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      title="Edit"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => { closeModal(); setTimeout(() => openDelete(active), 0) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
                <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-black transition">
                  <XIcon />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</span>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${(STATUS_CONFIG[active.status] ?? STATUS_CONFIG.open).className}`}>
                  {(STATUS_CONFIG[active.status] ?? STATUS_CONFIG.open).label}
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Details</p>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-black leading-relaxed whitespace-pre-wrap">
                  {active.details}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-400">Date logged</span>
                <span className="text-xs text-gray-500 font-medium">
                  {active.created_at
                    ? new Date(active.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={closeModal} className="px-5 py-2 text-sm font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ borderTop: '4px solid #ed6055' }}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-black">
                {modal === 'add' ? 'Add ESA Issue' : 'Edit ESA Issue'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-black transition"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Project</label>
                <select
                  value={form.project_id}
                  onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
                >
                  <option value="">— No project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Details <span className="text-[#ed6055]">*</span></label>
                <textarea
                  rows={4}
                  value={form.details}
                  onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                  placeholder="Describe the ESA issue…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
                >
                  {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                    <option key={val} value={val}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.details.trim()}
                className="px-5 py-2 text-sm font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d95248] disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Saving…' : modal === 'add' ? 'Add ESA Issue' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {modal === 'delete' && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ borderTop: '4px solid #ed6055' }}>
            <div className="px-6 py-5">
              <h3 className="text-base font-bold text-black mb-1">Delete ESA Issue?</h3>
              <p className="text-sm text-gray-500 line-clamp-2">{active.details}</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d95248] disabled:opacity-50 transition"
              >
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[9999] ${
          toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </section>
  )
}

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
)
const PencilIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)
