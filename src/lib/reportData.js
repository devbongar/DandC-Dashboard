import { supabase, fetchAll } from './supabaseClient'

// ── Fetch all data needed for reports ─────────────────────────────────────────

export async function fetchProjectsBasic() {
  const { data } = await supabase
    .from('projects')
    .select('id, name, project_code, business_unit, development_type, phase, province, city, lot_area, developable_area, project_brief, is_4ph_project')
    .order('name')
  return data ?? []
}

export async function fetchReportData(projectIds) {
  const ids = projectIds

  const [projects, issues, milestones, permits, floors, completions, poc, buildings, photos] = await Promise.all([
    supabase.from('projects')
      .select('id, name, project_code, business_unit, development_type, phase, province, city, lot_area, developable_area, project_brief, is_4ph_project, num_floors, num_units')
      .in('id', ids)
      .order('name')
      .then(r => r.data ?? []),

    supabase.from('issues')
      .select('id, project_id, status, issue_group, management_level, date_presented, details, caused_by, action_steps')
      .in('project_id', ids)
      .order('date_presented', { ascending: false })
      .then(r => r.data ?? []),

    supabase.from('workprogram_tasks')
      .select('id, project_id, milestone_name, baseline_end, actual_date, status')
      .in('project_id', ids)
      .order('baseline_end', { ascending: true })
      .then(r => r.data ?? []),

    supabase.from('project_permits')
      .select('id, project_id, permit_name, status, remarks, parent_id, sort_order')
      .in('project_id', ids)
      .order('sort_order')
      .then(r => r.data ?? []),

    // Use fetchAll — projects can have thousands of floors (e.g. 2958 floors for large developments)
    fetchAll(() => supabase.from('project_floors')
      .select('id, project_id, building_id, physical_level, marketing_level, num_units')
      .in('project_id', ids)),

    // Only fetch records where m4_date is set (non-null) — avoids scanning millions of blank rows.
    // Using gte('1900-01-01') instead of .not('is',null) to avoid PostgREST null-filter edge cases.
    fetchAll(() => supabase.from('project_unit_completion')
      .select('project_id, floor_id, unit_number, m4_date, m5_date')
      .in('project_id', ids)
      .gte('m4_date', '1900-01-01')),

    supabase.from('scurve_actual')
      .select('project_id, period_date, actual_pct')
      .in('project_id', ids)
      .is('building_id', null)
      .order('period_date', { ascending: true })
      .then(r => r.data ?? []),

    supabase.from('project_buildings')
      .select('id, project_id, name')
      .in('project_id', ids)
      .then(r => r.data ?? []),

    supabase.from('project_photos')
      .select('id, project_id, storage_path, file_name, caption, tags, photo_date')
      .in('project_id', ids)
      .order('photo_date', { ascending: false })
      .limit(200)
      .then(r => (r.data ?? []).map(p => ({
        ...p,
        url: supabase.storage.from('project-photos').getPublicUrl(p.storage_path).data.publicUrl,
      }))),
  ])

  return { projects, issues, milestones, permits, floors, completions, poc, buildings, photos }
}

// ── Derived metrics per project ───────────────────────────────────────────────

const DONE_PERMIT_STATUSES = ['done', 'obtained', 'approved']

export function projectMetrics(projectId, { issues, permits, completions, floors }) {
  const today         = new Date().toLocaleDateString('en-CA')  // YYYY-MM-DD local time
  const projFloors    = floors.filter(f => f.project_id === projectId)
  const projUnits     = completions.filter(c => c.project_id === projectId)
  const totalUnits    = projFloors.reduce((s, f) => s + (f.num_units ?? 0), 0) || projUnits.length
  // Count units actually completed to date (m4_date / m5_date already passed)
  const m4Units       = projUnits.filter(u => u.m4_date && u.m4_date <= today).length
  const m5Units       = projUnits.filter(u => u.m5_date && u.m5_date <= today).length
  const m4Pct         = totalUnits ? Math.round((m4Units / totalUnits) * 100) : 0
  const m5Pct         = totalUnits ? Math.round((m5Units / totalUnits) * 100) : 0

  const projPermits   = permits.filter(p => p.project_id === projectId)
  const leafPermits   = projPermits.filter(p => !projPermits.some(pp => pp.parent_id === p.id))
  const donePermits   = leafPermits.filter(p => DONE_PERMIT_STATUSES.includes(p.status)).length
  const permitPct     = leafPermits.length ? Math.round((donePermits / leafPermits.length) * 100) : null

  const openIssues    = issues.filter(i => i.project_id === projectId && i.status === 'open').length

  return { totalUnits, m4Units, m5Units, m4Pct, m5Pct, permitPct, openIssues, leafPermits: leafPermits.length, donePermits }
}
