import { describe, it, expect } from 'vitest'
import { formatPermitId, isOverdue, computePermitStatus } from '../lib/permitUtils'

describe('formatPermitId', () => {
  it('pads single-digit to 6 zeros', () => {
    expect(formatPermitId(1)).toBe('PRMT-000001')
  })
  it('pads 3-digit correctly', () => {
    expect(formatPermitId(123)).toBe('PRMT-000123')
  })
  it('handles 6-digit without padding', () => {
    expect(formatPermitId(999999)).toBe('PRMT-999999')
  })
  it('accepts numeric string', () => {
    expect(formatPermitId('42')).toBe('PRMT-000042')
  })
  it('returns empty string for 0', () => {
    expect(formatPermitId(0)).toBe('')
  })
  it('returns empty string for NaN', () => {
    expect(formatPermitId('abc')).toBe('')
  })
})

describe('isOverdue', () => {
  const past     = { planned_finish: '2020-01-01', status: 'pending' }
  const future   = { planned_finish: '2099-01-01', status: 'pending' }
  const acquired = { planned_finish: '2020-01-01', status: 'acquired' }
  const noDate   = { planned_finish: null, status: 'pending' }

  it('returns true when planned_finish is in the past and not acquired', () => {
    expect(isOverdue(past)).toBe(true)
  })
  it('returns false when planned_finish is in the future', () => {
    expect(isOverdue(future)).toBe(false)
  })
  it('returns false when status is acquired even if past', () => {
    expect(isOverdue(acquired)).toBe(false)
  })
  it('returns false when planned_finish is null', () => {
    expect(isOverdue(noDate)).toBe(false)
  })
  it('respects injected now date', () => {
    const permit = { planned_finish: '2026-06-01', status: 'pending' }
    expect(isOverdue(permit, new Date('2026-05-01'))).toBe(false)
    expect(isOverdue(permit, new Date('2026-07-01'))).toBe(true)
  })
})

describe('computePermitStatus', () => {
  it('returns acquired when actual_finish is set', () => {
    expect(computePermitStatus({ actual_finish: '2026-01-01', planned_finish: '2020-01-01', actual_start: null, status: null })).toBe('acquired')
  })
  it('returns acquired when status is acquired', () => {
    expect(computePermitStatus({ status: 'acquired', planned_finish: '2020-01-01', actual_start: null, actual_finish: null })).toBe('acquired')
  })
  it('returns overdue when past planned_finish and no actual_finish', () => {
    expect(computePermitStatus({ status: 'pending', planned_finish: '2020-01-01', actual_start: null, actual_finish: null })).toBe('overdue')
  })
  it('returns in-progress when actual_start is set and not overdue', () => {
    expect(computePermitStatus({ status: 'in-progress', planned_finish: '2099-01-01', actual_start: '2026-01-01', actual_finish: null })).toBe('in-progress')
  })
  it('returns pending by default', () => {
    expect(computePermitStatus({ status: 'pending', planned_finish: '2099-01-01', actual_start: null, actual_finish: null })).toBe('pending')
  })
})
