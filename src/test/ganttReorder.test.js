import { describe, it, expect } from 'vitest'
import { computeReorder } from '../lib/ganttUtils'

describe('computeReorder', () => {
  const ms = [
    { id: 'a', phase: 'Planning', parent_id: null, sort_order: 0 },
    { id: 'b', phase: 'Planning', parent_id: null, sort_order: 1 },
    { id: 'c', phase: 'Planning', parent_id: null, sort_order: 2 },
  ]

  it('returns null when activeId equals overId', () => {
    expect(computeReorder(ms, 'a', 'a')).toBeNull()
  })

  it('returns null when nodes are in different phases', () => {
    const mixed = [
      { id: 'a', phase: 'Planning',     parent_id: null, sort_order: 0 },
      { id: 'b', phase: 'Construction', parent_id: null, sort_order: 0 },
    ]
    expect(computeReorder(mixed, 'a', 'b')).toBeNull()
  })

  it('returns null when nodes have different parent_id', () => {
    const mixed = [
      { id: 'a', phase: 'Planning', parent_id: 'x', sort_order: 0 },
      { id: 'b', phase: 'Planning', parent_id: 'y', sort_order: 0 },
    ]
    expect(computeReorder(mixed, 'a', 'b')).toBeNull()
  })

  it('moves the first sibling to the last position', () => {
    const result = computeReorder(ms, 'a', 'c')
    expect(result.map(m => m.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves the last sibling to the first position', () => {
    const result = computeReorder(ms, 'c', 'a')
    expect(result.map(m => m.id)).toEqual(['c', 'a', 'b'])
  })

  it('moves a middle sibling one step up', () => {
    const result = computeReorder(ms, 'b', 'a')
    expect(result.map(m => m.id)).toEqual(['b', 'a', 'c'])
  })

  it('only reorders siblings sharing the same parent and phase', () => {
    const withChildren = [
      { id: 'a', phase: 'Planning', parent_id: null, sort_order: 0 },
      { id: 'b', phase: 'Planning', parent_id: null, sort_order: 1 },
      { id: 'child1', phase: 'Planning', parent_id: 'a', sort_order: 0 },
    ]
    const result = computeReorder(withChildren, 'a', 'b')
    // child1 should not move
    expect(result.find(m => m.id === 'child1')).toBeUndefined()
    expect(result.map(m => m.id)).toEqual(['b', 'a'])
  })
})
