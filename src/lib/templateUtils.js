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
  const { data: existing } = await supabase
    .from('workprogram_tasks')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (!existing?.length) {
    const { data: templateTasks, error: tErr } = await supabase
      .from('work_program_template_tasks')
      .select('*')
      .order('sort_order')
    if (tErr) return { error: tErr.message }
    if (!templateTasks?.length) return { error: null }

    const seqKey = new Map(templateTasks.map((t, i) => [t.id, i + 1]))
    const oldToNewId = new Map()

    const parents  = templateTasks.filter(t => !t.parent_id)
    const children = templateTasks.filter(t =>  t.parent_id)

    const { data: insertedParents, error: pErr } = await supabase
      .from('workprogram_tasks')
      .insert(parents.map(t => ({
        project_id:        projectId,
        sort_order:        seqKey.get(t.id),
        milestone_name:    t.task_name,
        phase:             t.phase,
        baseline_duration: t.duration,
        dependencies:      '[]',
      })))
      .select('id, sort_order')
    if (pErr) return { error: pErr.message }

    const parentSortToId = new Map((insertedParents ?? []).map(r => [Number(r.sort_order), r.id]))
    for (const t of parents) {
      const newId = parentSortToId.get(seqKey.get(t.id))
      if (newId) oldToNewId.set(t.id, newId)
    }

    if (children.length) {
      const childPayloads = children.map(t => {
        const newParentId = oldToNewId.get(t.parent_id)
        if (!newParentId) return null
        return {
          project_id:        projectId,
          sort_order:        seqKey.get(t.id),
          milestone_name:    t.task_name,
          phase:             t.phase,
          parent_id:         newParentId,
          baseline_duration: t.duration,
          dependencies:      '[]',
        }
      }).filter(Boolean)

      const { data: insertedChildren, error: cErr } = await supabase
        .from('workprogram_tasks')
        .insert(childPayloads)
        .select('id, sort_order')
      if (cErr) return { error: cErr.message }

      const childSortToId = new Map((insertedChildren ?? []).map(r => [Number(r.sort_order), r.id]))
      for (const t of children) {
        const newId = childSortToId.get(seqKey.get(t.id))
        if (newId) oldToNewId.set(t.id, newId)
      }
    }
  }

  return snapshotTasksToBaseline(baselineId, projectId, supabase)
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
