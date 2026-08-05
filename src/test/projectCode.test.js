import { describe, it, expect } from 'vitest'
import { formatProjectCode, isProjectCode } from '../lib/projectCode'

describe('formatProjectCode', () => {
  it('formats 1 as PRJ-000001', () => {
    expect(formatProjectCode(1)).toBe('PRJ-000001')
  })

  it('formats 42 as PRJ-000042', () => {
    expect(formatProjectCode(42)).toBe('PRJ-000042')
  })

  it('formats 999999 without extra padding', () => {
    expect(formatProjectCode(999999)).toBe('PRJ-999999')
  })

  it('throws for zero', () => {
    expect(() => formatProjectCode(0)).toThrow('positive integer')
  })

  it('throws for negative', () => {
    expect(() => formatProjectCode(-1)).toThrow('positive integer')
  })

  it('throws for a float', () => {
    expect(() => formatProjectCode(1.5)).toThrow('positive integer')
  })

  it('throws for a string', () => {
    expect(() => formatProjectCode('1')).toThrow('positive integer')
  })
})

describe('isProjectCode', () => {
  it('accepts PRJ-000001', () => {
    expect(isProjectCode('PRJ-000001')).toBe(true)
  })

  it('accepts PRJ-999999', () => {
    expect(isProjectCode('PRJ-999999')).toBe(true)
  })

  it('rejects a bare UUID', () => {
    expect(isProjectCode('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
  })

  it('rejects too few digits', () => {
    expect(isProjectCode('PRJ-00001')).toBe(false)
  })

  it('rejects too many digits', () => {
    expect(isProjectCode('PRJ-0000001')).toBe(false)
  })

  it('rejects wrong prefix', () => {
    expect(isProjectCode('prj-000001')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isProjectCode('')).toBe(false)
  })

  it('rejects null', () => {
    expect(isProjectCode(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isProjectCode(undefined)).toBe(false)
  })
})
