import { describe, it, expect } from 'vitest'
import { buildChildAddForm, getInlineSavePayload } from '../lib/ganttUtils'

describe('buildChildAddForm', () => {
  it('returns correct addForm shape for a top-level node', () => {
    const node = { id: 'abc', phase: 'Planning', depth: 0 }
    const result = buildChildAddForm(node)
    expect(result).toEqual({ phase: 'Planning', milestone_name: '', parentId: 'abc', depth: 1 })
  })

  it('increments depth for nested nodes', () => {
    const node = { id: 'xyz', phase: 'Construction', depth: 2 }
    const result = buildChildAddForm(node)
    expect(result).toEqual({ phase: 'Construction', milestone_name: '', parentId: 'xyz', depth: 3 })
  })

  it('returns null for a node at max depth (3) — cannot go deeper', () => {
    const node = { id: 'deep', phase: 'Design', depth: 3 }
    expect(buildChildAddForm(node)).toBeNull()
  })
})

describe('getInlineSavePayload', () => {
  it('returns null for empty name', () => {
    expect(getInlineSavePayload('', 'p1', 'Planning')).toBeNull()
  })

  it('returns null for whitespace-only name', () => {
    expect(getInlineSavePayload('   ', 'p1', 'Planning')).toBeNull()
  })

  it('returns trimmed payload for valid name', () => {
    expect(getInlineSavePayload('  Site Prep  ', 'p1', 'Planning')).toEqual({
      milestone_name: 'Site Prep',
      parent_id: 'p1',
      phase: 'Planning',
    })
  })

  it('accepts null parentId for top-level activities', () => {
    expect(getInlineSavePayload('Foundation', null, 'Construction')).toEqual({
      milestone_name: 'Foundation',
      parent_id: null,
      phase: 'Construction',
    })
  })
})
