// Dependency type options for UI dropdowns
export const DEP_TYPES = [
  { value: 'FS', label: 'FS — Finish to Start',  desc: 'B starts after A finishes' },
  { value: 'SS', label: 'SS — Start to Start',   desc: 'B starts after A starts'  },
  { value: 'FF', label: 'FF — Finish to Finish', desc: 'B finishes after A finishes' },
  { value: 'SF', label: 'SF — Start to Finish',  desc: 'B finishes after A starts' },
]

// Build a flat display list from a flat milestone array.
// Supports up to 4 levels of nesting (depth 0–3).
// collapsedIds: Set of milestone ids whose children should be hidden.
// Returns nodes in depth-first display order, each with:
//   .depth (0–3), .children (array), .hasChildren (bool)
export function buildTree(milestones, collapsedIds = new Set()) {
  if (!milestones.length) return []

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

  function assignDepth(node, d) {
    node.depth = Math.min(d, 3) // cap at depth 3 (level 4)
    node.children
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach(c => assignDepth(c, d + 1))
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
// Uses ISO string comparison (lexicographic = chronological for YYYY-MM-DD).
export function isViolated(type, fromM, toM) {
  const fS = fromM.planned_start, fE = fromM.planned_end
  const tS = toM.planned_start,   tE = toM.planned_end
  if (!fS || !fE || !tS || !tE) return false
  if (type === 'FS') return tS < fE   // to starts before from ends
  if (type === 'SS') return tS < fS   // to starts before from starts
  if (type === 'FF') return tE < fE   // to ends before from ends
  if (type === 'SF') return tE < fS   // to ends before from starts
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
    const mx = Math.min(fx1 - IND, tx1 - IND)
    return `M ${fx1} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx1} ${ty}`
  }
  if (type === 'FF') {
    // Right edge of A → right edge of B
    const mx = Math.max(fx2 + IND, tx2 + IND)
    return `M ${fx2} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx2} ${ty}`
  }
  if (type === 'SF') {
    // Left edge of A → right edge of B
    const mx = Math.min(fx1 - IND, tx2 - IND)
    return `M ${fx1} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx2} ${ty}`
  }
  return ''
}
