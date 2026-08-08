// Returns a Map<taskId, seqNumber> (1-based) sorted by sort_order.
// Used by WorkProgramTemplate for predecessor text numbering.
export function assignSeqNumbers(tasks) {
  const sorted = [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const map = new Map()
  sorted.forEach((t, i) => map.set(t.id, i + 1))
  return map
}

/**
 * Copies work_program_template_tasks into workprogram_tasks for a project,
 * then snapshots planned dates into workprogram_baseline_snapshots.
 * If tasks already exist for the project, skips insert and only creates snapshot.
 *
 * @param {string} baselineId - workprogram_baselines.id (already created by caller)
 * @param {string} projectId
 * @param {object} supabase
 * @returns {Promise<{error: string|null}>}
 */
export async function copyTemplateToBaseline(baselineId, projectId, supabase) {
  const { data: templateTasks, error: tErr } = await supabase
    .from('work_program_template_tasks')
    .select('*')
    .order('sort_order')
  if (tErr) return { error: tErr.message }
  if (!templateTasks?.length) return { error: null }

  // Map template uuid → new rawTaskId, then build composite activity id
  const oldToRawId = new Map()

  const parents  = templateTasks.filter(t => !t.parent_id)
  const children = templateTasks.filter(t =>  t.parent_id)

  const parentRows = parents.map((t, i) => {
    const rawId = crypto.randomUUID()
    oldToRawId.set(t.id, rawId)
    return {
      id:             `${rawId}_${baselineId}`,
      task_id:        rawId,
      baseline_id:    baselineId,
      project_id:     projectId,
      sort_order:     i + 1,
      milestone_name: t.task_name,
      phase:          t.phase,
      duration:       t.duration ?? null,
    }
  })

  const { error: pErr } = await supabase.from('workprogram_activities').insert(parentRows)
  if (pErr) return { error: pErr.message }

  if (children.length) {
    const childRows = children.map((t, i) => {
      const rawId       = crypto.randomUUID()
      const parentRawId = oldToRawId.get(t.parent_id)
      if (!parentRawId) return null
      oldToRawId.set(t.id, rawId)
      return {
        id:             `${rawId}_${baselineId}`,
        task_id:        rawId,
        baseline_id:    baselineId,
        project_id:     projectId,
        sort_order:     parents.length + i + 1,
        milestone_name: t.task_name,
        phase:          t.phase,
        duration:       t.duration ?? null,
        parent_id:      `${parentRawId}_${baselineId}`,
      }
    }).filter(Boolean)

    if (childRows.length) {
      const { error: cErr } = await supabase.from('workprogram_activities').insert(childRows)
      if (cErr) return { error: cErr.message }
    }
  }

  return { error: null }
}

/**
 * Snapshots current task baseline_start/baseline_end into workprogram_baseline_snapshots.
 * Used when creating a new named baseline.
 *
 * @param {string} baselineId - workprogram_baselines.id
 * @param {string} projectId
 * @param {object} supabase
 * @returns {Promise<{error: string|null}>}
 */
export async function snapshotTasksToBaseline(baselineId, projectId, supabase) {
  const { data: tasks, error: tErr } = await supabase
    .from('workprogram_tasks')
    .select('id, baseline_start, baseline_end')
    .eq('project_id', projectId)
  if (tErr) return { error: tErr.message }
  if (!tasks?.length) return { error: null }

  const snapshots = tasks.map(t => ({
    baseline_id:    baselineId,
    task_id:        t.id,
    baseline_start: t.baseline_start,
    baseline_end:   t.baseline_end,
  }))

  const { error: sErr } = await supabase
    .from('workprogram_baseline_snapshots')
    .upsert(snapshots, { onConflict: 'baseline_id,task_id' })
  return { error: sErr?.message ?? null }
}
