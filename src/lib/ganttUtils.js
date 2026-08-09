const MAX_DEPTH = 3

export function buildChildAddForm(node) {
  if (node.depth >= MAX_DEPTH) return null
  return { phase: node.phase, milestone_name: '', parentId: node.id, depth: node.depth + 1 }
}

export function getInlineSavePayload(name, parentId, phase) {
  if (!name.trim()) return null
  return { milestone_name: name.trim(), parent_id: parentId, phase }
}

// Returns the reordered siblings array after moving activeId to overId's position,
// or null if the move is invalid (different phase, different parent, or same node).
export function computeReorder(milestones, activeId, overId) {
  if (activeId === overId) return null

  const activeNode = milestones.find(m => m.id === activeId)
  const overNode   = milestones.find(m => m.id === overId)

  if (!activeNode || !overNode) return null
  if (activeNode.parent_id !== overNode.parent_id) return null

  const siblings = milestones
    .filter(m => m.parent_id === activeNode.parent_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const activeIdx = siblings.findIndex(s => s.id === activeId)
  const overIdx   = siblings.findIndex(s => s.id === overId)

  if (activeIdx === -1 || overIdx === -1) return null

  const result = siblings.slice()
  result.splice(overIdx, 0, result.splice(activeIdx, 1)[0])
  return result
}
