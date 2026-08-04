/**
 * Clones all milestones and dependencies from one baseline into another.
 * Uses sequential sort_order keys for batch-insert correlation (same pattern as copyTemplateToBaseline).
 * @param {string} sourceId - source baseline ID
 * @param {string} targetId - newly created baseline ID
 * @param {object} supabase - Supabase client
 * @param {string} projectId
 * @returns {Promise<{error: string|null}>}
 */
export async function copyBaselineToBaseline(sourceId, targetId, supabase, projectId) {
  const { data: sourceMilestones, error: fetchErr } = await supabase
    .from('workprogram_activities')
    .select('*')
    .eq('baseline_id', sourceId)
    .order('sort_order')
  if (fetchErr) return { error: fetchErr.message }
  if (!sourceMilestones?.length) return { error: null }

  const seqKey = new Map(sourceMilestones.map((m, i) => [m.id, i + 1]))
  const oldToNewId = new Map()

  const parents  = sourceMilestones.filter(m => !m.parent_id)
  const children = sourceMilestones.filter(m =>  m.parent_id)

  const { data: insertedParents, error: parentErr } = await supabase
    .from('workprogram_activities')
    .insert(parents.map(m => ({
      project_id: projectId, baseline_id: targetId,
      phase: m.phase, milestone_name: m.milestone_name,
      sort_order: seqKey.get(m.id), duration: m.duration, parent_id: null,
      planned_start:   m.planned_start,   planned_end:     m.planned_end,
      actual_start:    m.actual_start,    actual_end:      m.actual_end,
      projected_start: m.projected_start, projected_end:   m.projected_end,
    })))
    .select('id, sort_order')
  if (parentErr) return { error: parentErr.message }

  const parentSortToId = new Map((insertedParents ?? []).map(r => [Number(r.sort_order), r.id]))
  for (const m of parents) {
    const newId = parentSortToId.get(seqKey.get(m.id))
    if (newId) oldToNewId.set(m.id, newId)
  }

  if (children.length) {
    const childPayloads = children.map(m => {
      const newParentId = oldToNewId.get(m.parent_id)
      if (!newParentId) return null
      return {
        project_id: projectId, baseline_id: targetId,
        phase: m.phase, milestone_name: m.milestone_name,
        sort_order: seqKey.get(m.id), duration: m.duration, parent_id: newParentId,
        planned_start:   m.planned_start,   planned_end:     m.planned_end,
        actual_start:    m.actual_start,    actual_end:      m.actual_end,
        projected_start: m.projected_start, projected_end:   m.projected_end,
      }
    }).filter(Boolean)

    const { data: insertedChildren, error: childErr } = await supabase
      .from('workprogram_activities').insert(childPayloads).select('id, sort_order')
    if (childErr) return { error: childErr.message }

    const childSortToId = new Map((insertedChildren ?? []).map(r => [Number(r.sort_order), r.id]))
    for (const m of children) {
      const newId = childSortToId.get(seqKey.get(m.id))
      if (newId) oldToNewId.set(m.id, newId)
    }
  }

  const { data: sourceDeps } = await supabase
    .from('workprogram_dependencies')
    .select('*')
    .eq('baseline_id', sourceId)

  if (sourceDeps?.length) {
    const depRows = sourceDeps.map(dep => {
      const newFromId = oldToNewId.get(dep.from_id)
      const newToId   = oldToNewId.get(dep.to_id)
      if (!newFromId || !newToId) return null
      return {
        project_id: projectId, baseline_id: targetId,
        from_id: newFromId, to_id: newToId,
        type: dep.type, lag_days: dep.lag_days,
      }
    }).filter(Boolean)

    if (depRows.length) {
      const { error: depErr } = await supabase.from('workprogram_dependencies').insert(depRows)
      if (depErr) return { error: depErr.message }
    }
  }

  return { error: null }
}

/**
 * Assigns seq numbers to template tasks.
 * Top-level tasks: "1", "2", "3"...
 * Children: "1.1", "1.2", "2.1"...
 * @param {Array} tasks - sorted by sort_order, shape { id, parent_id, ... }
 * @returns {Map<string, string>} id → seq string
 */
export function assignSeqNumbers(tasks) {
  const seqMap = new Map()
  let topCount = 0
  const childCountByParent = new Map()

  for (const task of tasks) {
    if (!task.parent_id) {
      topCount++
      seqMap.set(task.id, String(topCount))
    } else {
      const parentSeq = seqMap.get(task.parent_id) ?? '?'
      const prev = childCountByParent.get(task.parent_id) ?? 0
      const childIdx = prev + 1
      childCountByParent.set(task.parent_id, childIdx)
      seqMap.set(task.id, `${parentSeq}.${childIdx}`)
    }
  }
  return seqMap
}

/**
 * Parses template predecessor text into dependency objects.
 * Format: "<seq> <type>[+<lag>]" comma-separated. e.g. "1.1 FS, 2 SS+7"
 * @param {string} text
 * @param {Map<string, string>} seqToId - seq string → milestone UUID in the NEW baseline
 * @returns {Array<{fromId: string, type: string, lagDays: number}>}
 */
export function parseTemplatePredecessors(text, seqToId) {
  if (!text?.trim()) return []
  const tokens = text.split(',').map(s => s.trim()).filter(Boolean)
  const result = []
  for (const token of tokens) {
    const m = token.match(/^([\d.]+)\s*(FS|SS|FF|SF)?(?:\+(\d+))?$/i)
    if (!m) continue
    const seq     = m[1]
    const type    = m[2]?.toUpperCase() ?? 'FS'
    const lagDays = m[3] ? parseInt(m[3], 10) : 0
    const fromId  = seqToId.get(seq)
    if (!fromId) continue
    result.push({ fromId, type, lagDays })
  }
  return result
}

/**
 * Copies all work_program_template_tasks into a new baseline as workprogram_activities.
 * Also inserts workprogram_dependencies by resolving predecessor_text.
 * If sourceBaselineId is provided, actual/projected dates from matching milestones
 * in that baseline are carried over to the new baseline (matched by phase + name).
 * @param {string} baselineId - the newly created milestone_baselines.id
 * @param {object} supabase - Supabase client
 * @param {string} projectId - the project id (needed for workprogram_activities.project_id)
 * @param {string|null} sourceBaselineId - existing baseline whose actual dates to carry over
 * @returns {Promise<{error: string|null}>}
 */
export async function copyTemplateToBaseline(baselineId, supabase, projectId, sourceBaselineId = null) {
  const { data: tasks, error: fetchErr } = await supabase
    .from('work_program_template_tasks')
    .select('*')
    .order('sort_order')
  if (fetchErr) return { error: fetchErr.message }
  if (!tasks?.length) return { error: null }

  const templateSeqMap = assignSeqNumbers(tasks)
  const templateToNewId = new Map()

  // Assign clean sequential integers for sort_order (template values may be fractional
  // after inline insertions, which would fail workprogram_activities INTEGER column)
  const seqSortOrder = new Map(tasks.map((t, i) => [t.id, i + 1]))

  const parents  = tasks.filter(t => !t.parent_id)
  const children = tasks.filter(t =>  t.parent_id)

  // Batch insert all parents in one DB call
  const { data: insertedParents, error: parentErr } = await supabase
    .from('workprogram_activities')
    .insert(parents.map(t => ({
      project_id: projectId, baseline_id: baselineId,
      phase: t.phase, milestone_name: t.milestone_name,
      sort_order: seqSortOrder.get(t.id), duration: t.duration, parent_id: null,
    })))
    .select('id, sort_order')
  if (parentErr) return { error: parentErr.message }

  const parentSortToId = new Map((insertedParents ?? []).map(r => [Number(r.sort_order), r.id]))
  for (const t of parents) {
    const newId = parentSortToId.get(seqSortOrder.get(t.id))
    if (newId) templateToNewId.set(t.id, newId)
  }

  // Batch insert all children in one DB call (parent IDs now resolved)
  if (children.length) {
    const childPayloads = children
      .map(t => {
        const newParentId = templateToNewId.get(t.parent_id)
        if (!newParentId) return null
        return {
          project_id: projectId, baseline_id: baselineId,
          phase: t.phase, milestone_name: t.milestone_name,
          sort_order: seqSortOrder.get(t.id), duration: t.duration, parent_id: newParentId,
        }
      })
      .filter(Boolean)

    const { data: insertedChildren, error: childErr } = await supabase
      .from('workprogram_activities')
      .insert(childPayloads)
      .select('id, sort_order')
    if (childErr) return { error: childErr.message }

    const childSortToId = new Map((insertedChildren ?? []).map(r => [Number(r.sort_order), r.id]))
    for (const t of children) {
      const newId = childSortToId.get(seqSortOrder.get(t.id))
      if (newId) templateToNewId.set(t.id, newId)
    }
  }

  // Build seq → new milestone ID map for predecessor resolution
  const seqToNewId = new Map()
  for (const [templateId, seq] of templateSeqMap) {
    const newId = templateToNewId.get(templateId)
    if (newId) seqToNewId.set(seq, newId)
  }

  const depRows = []
  for (const task of tasks) {
    if (!task.predecessor_text) continue
    const newToId = templateToNewId.get(task.id)
    if (!newToId) continue
    const deps = parseTemplatePredecessors(task.predecessor_text, seqToNewId)
    for (const dep of deps) {
      depRows.push({
        project_id: projectId,
        baseline_id: baselineId,
        from_id:     dep.fromId,
        to_id:       newToId,
        type:        dep.type,
        lag_days:    dep.lagDays,
      })
    }
  }

  if (depRows.length) {
    const { error: depErr } = await supabase
      .from('workprogram_dependencies')
      .insert(depRows)
    if (depErr) return { error: depErr.message }
  }

  // Carry over actual/projected dates from the source baseline (matched by phase + name)
  if (sourceBaselineId) {
    const { data: sourceMilestones } = await supabase
      .from('workprogram_activities')
      .select('phase, milestone_name, actual_start, actual_end, projected_start, projected_end')
      .eq('baseline_id', sourceBaselineId)

    const withDates = (sourceMilestones ?? []).filter(m => m.actual_start || m.actual_end)
    if (withDates.length) {
      const sourceMap = new Map(
        withDates.map(m => [`${m.phase}|${m.milestone_name.toLowerCase().trim()}`, m])
      )

      const updates = []
      for (const task of tasks) {
        const key = `${task.phase}|${task.milestone_name.toLowerCase().trim()}`
        const source = sourceMap.get(key)
        if (!source) continue
        const newId = templateToNewId.get(task.id)
        if (!newId) continue
        updates.push({
          id: newId,
          actual_start:    source.actual_start,
          actual_end:      source.actual_end,
          projected_start: source.projected_start,
          projected_end:   source.projected_end,
        })
      }

      if (updates.length) {
        const results = await Promise.all(
          updates.map(u =>
            supabase.from('workprogram_activities')
              .update({
                actual_start:    u.actual_start,
                actual_end:      u.actual_end,
                projected_start: u.projected_start,
                projected_end:   u.projected_end,
              })
              .eq('id', u.id)
          )
        )
        const firstErr = results.find(r => r.error)?.error
        if (firstErr) return { error: firstErr.message }
      }
    }
  }

  return { error: null }
}
