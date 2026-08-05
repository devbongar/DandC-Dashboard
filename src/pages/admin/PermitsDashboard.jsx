import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import PermitDetail from '../../components/PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../../lib/permitUtils'

const STATUS_OPTIONS = ['all', 'pending', 'in-progress', 'acquired', 'overdue']

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

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: pData }, { data: projData }] = await Promise.all([
      supabase
        .from('permits')
        .select('*, projects(name)')
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

  const rows = (permits ?? []).filter(p => {
    const effectiveStatus = computePermitStatus(p)
    const matchProject = filterProject === 'all' || p.project_id === filterProject
    const matchStatus  = filterStatus  === 'all' || effectiveStatus === filterStatus
    const q = search.toLowerCase()
    const matchSearch  = !q ||
      p.id?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      (p.projects?.name ?? '').toLowerCase().includes(q) ||
      (p.responsible_person ?? '').toLowerCase().includes(q)
    return matchProject && matchStatus && matchSearch
  })

  const counts = {
    total:      permits.length,
    pending:    permits.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: permits.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   permits.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    permits.filter(p => computePermitStatus(p) === 'overdue').length,
  }

  if (loading || profileLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Permits Monitoring</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">All permits across all projects</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',       value: counts.total,      color: 'text-gray-700 dark:text-gray-200' },
            { label: 'Pending',     value: counts.pending,    color: 'text-gray-600 dark:text-gray-400' },
            { label: 'In Progress', value: counts.inProgress, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Acquired',    value: counts.acquired,   color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Overdue',     value: counts.overdue,    color: 'text-red-600 dark:text-red-400' },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search permits..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          >
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  {['Permit ID','Project','Name','Status','Planned Finish','Forecast Finish','Responsible'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No permits found.</td></tr>
                )}
                {rows.map(permit => {
                  const status = computePermitStatus(permit)
                  return (
                    <tr
                      key={permit.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(permit)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{permit.id}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[160px] truncate">{permit.projects?.name ?? permit.project_id}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{permit.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{permit.planned_finish ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{permit.forecast_finish ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{permit.responsible_person ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(permit) }}
                          className="text-xs text-[#ed6055] hover:underline font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PermitDetail drawer */}
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
