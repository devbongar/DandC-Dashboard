// Dependency type options for UI dropdowns
export const DEP_TYPES = [
  { value: 'FS', label: 'FS -- Finish to Start',  desc: 'B starts after A finishes' },
  { value: 'SS', label: 'SS -- Start to Start',   desc: 'B starts after A starts'  },
  { value: 'FF', label: 'FF -- Finish to Finish', desc: 'B finishes after A finishes' },
  { value: 'SF', label: 'SF -- Start to Finish',  desc: 'B finishes after A starts' },
]

// Converts JSONB dependencies on each task into flat dep rows for visualization.
// Input: tasks array where each task has .dependencies = [{id, type, lag}]
// Output: [{from_id, to_id, type, lag}] matching old workprogram_dependencies row shape
export function expandDependencies(tasks) {
  const rows = []
  for (const task of tasks) {
    const deps = Array.isArray(task.dependencies) ? task.dependencies : []
    for (const dep of deps) {
      if (dep.id && dep.type) {
        rows.push({ from_id: dep.id, to_id: task.id, type: dep.type, lag: dep.lag ?? 0 })
      }
    }
  }
  return rows
}

// Build a flat display list from a flat milestone array.
// Supports up to 4 levels of nesting (depth 0–3).
// collapsedIds: Set of milestone ids whose children should be hidden.
// Returns nodes in depth-first display order, each with:
//   .depth (0–3), .children (array), .hasChildren (bool)
export function buildTree(milestones, collapsedIds = new Set()) {
  if (!Array.isArray(milestones) || !milestones.length) return []

  const byId = {}
  milestones.forEach(m => {
    byId[m.id] = { ...m, children: [], depth: 0 }
  })

  const roots = []
  milestones.forEach(m => {
    const node = byId[m.id]
    if (m.parent_id && byId[m.parent_id]) {
      byId[m.parent_id].children.push(node)
    } else {
      roots.push(node)
    }
  })

  function assignDepth(node, d, visited = new Set()) {
    if (visited.has(node.id)) return
    visited.add(node.id)
    node.depth = Math.min(d, 3) // cap at depth 3 (level 4)
    node.children
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach(c => assignDepth(c, d + 1, visited))
  }
  roots
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .forEach(r => assignDepth(r, 0))

  // Mark hasChildren for rendering the toggle icon
  Object.values(byId).forEach(n => { n.hasChildren = n.children.length > 0 })

  // Flatten in depth-first display order, respecting collapsed nodes
  const flat = []
  function walk(node) {
    flat.push(node)
    if (!collapsedIds.has(node.id)) {
      node.children.forEach(walk)
    }
  }
  roots.forEach(walk)
  return flat
}

// Returns true when the dependency constraint is violated using planned dates.
// lagDays: successor must start/end this many days after the anchor; default 0.
export function isViolated(type, fromM, toM, lagDays = 0) {
  const fS = fromM.planned_start, fE = fromM.planned_end
  const tS = toM.planned_start,   tE = toM.planned_end
  if (!fS || !fE || !tS || !tE) return false
  const addDays = (isoStr, days) => {
    if (!days) return isoStr
    const d = new Date(isoStr + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }
  if (type === 'FS') return tS < addDays(fE, lagDays)
  if (type === 'SS') return tS < addDays(fS, lagDays)
  if (type === 'FF') return tE < addDays(fE, lagDays)
  if (type === 'SF') return tE < addDays(fS, lagDays)
  return false
}

// Returns an SVG path string (d attribute) for a dependency arrow elbow.
// fromBar / toBar: { x1, x2, yMid } where x1=bar left edge, x2=bar right edge, yMid=row center y in SVG coords
// Elbow indent (IND): how far the line extends past the anchor before turning.
const IND = 14

export function calcArrowPath(type, fromBar, toBar) {
  const { x1: fx1, x2: fx2, yMid: fy } = fromBar
  const { x1: tx1, x2: tx2, yMid: ty } = toBar

  if (type === 'FS') {
    // Right edge of A → left edge of B
    const mx = Math.max(fx2 + IND, tx1 - IND)
    return `M ${fx2} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx1} ${ty}`
  }
  if (type === 'SS') {
    // Left edge of A → left edge of B
    const mx = Math.max(0, Math.min(fx1 - IND, tx1 - IND))
    return `M ${fx1} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx1} ${ty}`
  }
  if (type === 'FF') {
    // Right edge of A → right edge of B
    const mx = Math.max(fx2 + IND, tx2 + IND)
    return `M ${fx2} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx2} ${ty}`
  }
  if (type === 'SF') {
    // Left edge of A → right edge of B
    const mx = Math.max(0, Math.min(fx1 - IND, tx2 - IND))
    return `M ${fx1} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx2} ${ty}`
  }
  return ''
}

// Parses predecessor text like "3FS,2SS+5,1" into structured objects.
// rowNumToId: Map<number, string> mapping display row number to milestone UUID.
// Returns array of { fromId, type, lagDays } or null if any token is invalid.
export function parsePredecessors(text, rowNumToId) {
  if (!text?.trim()) return []
  const tokens = text.split(',').map(s => s.trim()).filter(Boolean)
  const result = []
  for (const token of tokens) {
    const m = token.match(/^(\d+)(FS|SS|FF|SF)?(([+-]\d+))?$/i)
    if (!m) return null
    const rowNum  = parseInt(m[1], 10)
    const type    = m[2]?.toUpperCase() ?? 'FS'
    const lagDays = m[4] ? parseInt(m[4], 10) : 0
    const fromId  = rowNumToId.get(rowNum)
    if (!fromId) return null
    result.push({ fromId, type, lagDays })
  }
  return result
}

// Formats an array of dependency rows into predecessor text like "3FS,2SS+5".
// idToRowNum: Map<string, number> mapping milestone UUID to display row number.
// deps: array of { from_id, type, lag_days } (DB shape).
export function formatPredecessors(deps, idToRowNum) {
  if (!deps?.length) return ''
  return deps
    .map(d => {
      const rowNum = idToRowNum.get(d.from_id)
      if (rowNum == null) return null
      const lagVal = d.lag ?? d.lag_days ?? 0
      const lag = lagVal > 0 ? `+${lagVal}` : lagVal < 0 ? `${lagVal}` : ''
      return `${rowNum}${d.type ?? 'FS'}${lag}`
    })
    .filter(Boolean)
    .join(',')
}

// Computes planned_start / planned_end for all schedulable leaf tasks using CPM forward pass.
// milestones: workprogram_tasks rows (must include .duration, .parent_id, .id)
// dependencies: flat dep rows from expandDependencies(tasks)
// startDate: ISO date string (YYYY-MM-DD) -- the project start anchor
// Returns { [milestoneId]: { planned_start, planned_end } } on success, or { error: 'circular' } on cycle.
export function scheduleMilestones(milestones, dependencies, startDate) {
  if (!startDate || !milestones?.length) return {}
  const safeDeps = dependencies ?? []

  const addDays = (isoStr, days) => {
    const [y, m, dd] = isoStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10)
  }

  // 1. Identify parent tasks (any id that appears as parent_id of another row)
  const parentIds = new Set(milestones.map(m => m.parent_id).filter(Boolean))

  // 2. Schedulable leaf tasks: not a parent, duration is a positive integer
  const leafTasks = milestones.filter(
    m => !parentIds.has(m.id) && m.duration != null && Number.isInteger(m.duration) && m.duration > 0
  )
  if (!leafTasks.length) return {}

  const leafIds = new Set(leafTasks.map(m => m.id))
  // Only dependencies where both endpoints are schedulable leaf tasks
  const relevantDeps = safeDeps.filter(d => leafIds.has(d.from_id) && leafIds.has(d.to_id))

  // 3. Build adjacency structures for Kahn's algorithm
  const successors = {}   // id → array of dependency rows whose from_id === id
  const inDegree   = {}   // id → count of incoming edges
  leafTasks.forEach(m => { successors[m.id] = []; inDegree[m.id] = 0 })
  relevantDeps.forEach(dep => {
    successors[dep.from_id].push(dep)
    inDegree[dep.to_id]++
  })

  // 4. Kahn's topological sort (BFS)
  const queue = leafTasks.filter(m => inDegree[m.id] === 0).map(m => m.id)
  const order = []
  while (queue.length > 0) {
    const id = queue.shift()
    order.push(id)
    successors[id].forEach(dep => {
      inDegree[dep.to_id]--
      if (inDegree[dep.to_id] === 0) queue.push(dep.to_id)
    })
  }
  if (order.length !== leafTasks.length) return { error: 'circular' }

  // 5. Forward pass
  const byId = {}
  leafTasks.forEach(m => { byId[m.id] = m })
  const computed = {}  // id → { planned_start, planned_end }

  order.forEach(id => {
    const m = byId[id]
    const incomingDeps = relevantDeps.filter(d => d.to_id === id)

    let plannedStart
    if (!incomingDeps.length) {
      plannedStart = startDate
    } else {
      const anchors = incomingDeps.flatMap(dep => {
        const from = computed[dep.from_id]
        if (!from) return []
        const type   = dep.type     ?? 'FS'
        const lag    = dep.lag_days ?? 0
        const dur    = m.duration
        if (type === 'FS') return [addDays(from.planned_end,   lag + 1)]
        if (type === 'SS') return [addDays(from.planned_start, lag)]
        if (type === 'FF') return [addDays(from.planned_end,   lag - dur + 1)]
        if (type === 'SF') return [addDays(from.planned_start, lag - dur + 1)]
        return []
      })
      plannedStart = anchors.length ? anchors.sort().at(-1) : startDate
    }

    computed[id] = {
      planned_start: plannedStart,
      planned_end:   addDays(plannedStart, m.duration - 1),
    }
  })

  return computed
}

// Calculates projected_start / projected_end for all leaf tasks.
// Rows with actual dates are treated as fixed anchors (projected = actual).
// Rows without actual dates cascade forward from predecessor projected dates + duration.
// Parent tasks are supported as predecessors -- their projected dates are rolled up from children.
// Returns { [milestoneId]: { projected_start, projected_end } } or { error: 'circular' }.
export function scheduleProjected(milestones, dependencies) {
  const safeDeps = dependencies ?? []
  if (!milestones?.length) return {}

  const addDays = (isoStr, days) => {
    const [y, m, dd] = isoStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10)
  }

  const parentIds = new Set(milestones.map(m => m.parent_id).filter(Boolean))
  const leafTasks = milestones.filter(
    m => !parentIds.has(m.id) && m.duration != null && Number.isInteger(m.duration) && m.duration > 0
  )
  if (!leafTasks.length) return {}

  const leafIds = new Set(leafTasks.map(m => m.id))

  // Build a "known" projected map seeded from each task's actual or stored projected dates.
  // This is the lookup used when resolving predecessor dates (works for any task, including parents).
  const known = new Map()
  for (const m of milestones) {
    if (m.actual_start || m.actual_end) {
      known.set(m.id, {
        projected_start: m.actual_start ?? null,
        projected_end:   m.actual_end ?? (m.actual_start ? addDays(m.actual_start, (m.duration ?? 1) - 1) : null),
      })
    } else if (m.projected_start || m.projected_end) {
      known.set(m.id, { projected_start: m.projected_start ?? null, projected_end: m.projected_end ?? null })
    }
  }

  // Roll up parent projected dates from their children (bottom-up, up to 5 levels deep).
  // This lets dependencies FROM a parent task resolve correctly.
  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    for (const m of milestones) {
      if (!parentIds.has(m.id)) continue
      const children = milestones.filter(c => c.parent_id === m.id)
      const childEntries = children.map(c => known.get(c.id)).filter(Boolean)
      if (!childEntries.length) continue
      const starts = childEntries.map(e => e.projected_start).filter(Boolean)
      const ends   = childEntries.map(e => e.projected_end).filter(Boolean)
      if (!ends.length) continue
      const entry = { projected_start: starts.length ? starts.sort()[0] : null, projected_end: ends.sort().at(-1) }
      const prev  = known.get(m.id)
      if (!prev || prev.projected_end !== entry.projected_end) { known.set(m.id, entry); changed = true }
    }
    if (!changed) break
  }

  // Topological sort on leaf-to-leaf deps (for forward-pass ordering)
  const leafDeps = safeDeps.filter(d => leafIds.has(d.from_id) && leafIds.has(d.to_id))
  const successors = {}
  const inDegree   = {}
  leafTasks.forEach(m => { successors[m.id] = []; inDegree[m.id] = 0 })
  leafDeps.forEach(dep => { successors[dep.from_id].push(dep); inDegree[dep.to_id]++ })
  const queue = leafTasks.filter(m => inDegree[m.id] === 0).map(m => m.id)
  const order = []
  while (queue.length > 0) {
    const id = queue.shift()
    order.push(id)
    successors[id].forEach(dep => { if (--inDegree[dep.to_id] === 0) queue.push(dep.to_id) })
  }
  if (order.length !== leafTasks.length) return { error: 'circular' }

  const byId = {}
  leafTasks.forEach(m => { byId[m.id] = m })
  const computed = {}

  // All deps that point TO a leaf (from_id can be a parent or another leaf)
  const depsToLeaf = safeDeps.filter(d => leafIds.has(d.to_id))

  const computeEntry = (id) => {
    const m = byId[id]
    if (!m) return

    if (m.actual_start || m.actual_end) {
      const entry = known.get(id) ?? null
      if (entry) { computed[id] = entry; known.set(id, entry) }
      return
    }

    const incomingDeps = depsToLeaf.filter(d => d.to_id === id)

    if (!incomingDeps.length) {
      const existing = known.get(id)
      const fallback = m.planned_start
        ? { projected_start: m.planned_start, projected_end: m.planned_end || addDays(m.planned_start, m.duration - 1) }
        : null
      const entry = existing || fallback
      if (entry) { computed[id] = entry; known.set(id, entry) }
      return
    }

    const anchors = incomingDeps.flatMap(dep => {
      const from = (computed[dep.from_id] ?? known.get(dep.from_id)) ?? null
      if (!from) return []
      const type = dep.type     ?? 'FS'
      const lag  = dep.lag_days ?? 0
      const dur  = m.duration
      if (type === 'FS') return from.projected_end   ? [addDays(from.projected_end,   lag + 1)]       : []
      if (type === 'SS') return from.projected_start ? [addDays(from.projected_start, lag)]            : []
      if (type === 'FF') return from.projected_end   ? [addDays(from.projected_end,   lag - dur + 1)] : []
      if (type === 'SF') return from.projected_start ? [addDays(from.projected_start, lag - dur + 1)] : []
      return []
    })

    if (!anchors.length) {
      const existing = known.get(id)
      if (existing) { computed[id] = existing; known.set(id, existing) }
      return
    }

    const projStart = anchors.sort().at(-1)
    computed[id] = { projected_start: projStart, projected_end: addDays(projStart, m.duration - 1) }
    known.set(id, computed[id])
  }

  // First forward pass in topological order
  order.forEach(id => computeEntry(id))

  // Iterative passes: re-roll-up parents from newly computed leaves, then retry skipped tasks.
  // Needed for tasks that depend on a parent whose children were computed in the first pass.
  for (let round = 0; round < 10; round++) {
    // Re-compute parent projected dates using freshly computed leaf values
    let changed = false
    for (const m of milestones) {
      if (!parentIds.has(m.id)) continue
      const children = milestones.filter(c => c.parent_id === m.id)
      const childEntries = children.map(c => computed[c.id] ?? known.get(c.id)).filter(Boolean)
      if (!childEntries.length) continue
      const starts = childEntries.map(e => e.projected_start).filter(Boolean)
      const ends   = childEntries.map(e => e.projected_end).filter(Boolean)
      if (!ends.length) continue
      const entry = { projected_start: starts.sort()[0] ?? null, projected_end: ends.sort().at(-1) }
      const prev  = known.get(m.id)
      if (!prev || prev.projected_end !== entry.projected_end) { known.set(m.id, entry); changed = true }
    }

    // Retry tasks that were skipped in the previous pass
    let leafChanged = false
    order.forEach(id => {
      if (computed[id]) return  // already resolved
      const before = JSON.stringify(computed[id])
      computeEntry(id)
      if (JSON.stringify(computed[id]) !== before) leafChanged = true
    })

    if (!changed && !leafChanged) break
  }

  return computed
}
