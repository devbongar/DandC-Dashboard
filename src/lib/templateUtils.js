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
 * Copies all work_program_template_tasks into a new baseline as project_milestones.
 * Also inserts milestone_dependencies by resolving predecessor_text.
 * @param {string} baselineId - the newly created milestone_baselines.id
 * @param {object} supabase - Supabase client
 * @param {string} projectId - the project id (needed for project_milestones.project_id)
 * @returns {Promise<{error: string|null}>}
 */
export async function copyTemplateToBaseline(baselineId, supabase, projectId) {
  const { data: tasks, error: fetchErr } = await supabase
    .from('work_program_template_tasks')
    .select('*')
    .order('sort_order')
  if (fetchErr) return { error: fetchErr.message }
  if (!tasks?.length) return { error: null }

  const templateSeqMap = assignSeqNumbers(tasks)
  const templateToNewId = new Map()

  const parents  = tasks.filter(t => !t.parent_id)
  const children = tasks.filter(t =>  t.parent_id)

  for (const task of parents) {
    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id:     projectId,
        baseline_id:    baselineId,
        phase:          task.phase,
        milestone_name: task.milestone_name,
        sort_order:     task.sort_order,
        duration:       task.duration,
        parent_id:      null,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    templateToNewId.set(task.id, data.id)
  }

  for (const task of children) {
    const newParentId = templateToNewId.get(task.parent_id)
    if (!newParentId) continue
    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id:     projectId,
        baseline_id:    baselineId,
        phase:          task.phase,
        milestone_name: task.milestone_name,
        sort_order:     task.sort_order,
        duration:       task.duration,
        parent_id:      newParentId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    templateToNewId.set(task.id, data.id)
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
      .from('milestone_dependencies')
      .insert(depRows)
    if (depErr) return { error: depErr.message }
  }

  return { error: null }
}
