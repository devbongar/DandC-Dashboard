import { describe, it, expect } from 'vitest'
import { formatUserCode, isUserCode } from '../lib/userCode'

describe('formatUserCode', () => {
  it('formats single-digit numbers with leading zeros', () => {
    expect(formatUserCode(1)).toBe('USR-000001')
    expect(formatUserCode(5)).toBe('USR-000005')
    expect(formatUserCode(9)).toBe('USR-000009')
  })

  it('formats multi-digit numbers with leading zeros', () => {
    expect(formatUserCode(10)).toBe('USR-000010')
    expect(formatUserCode(99)).toBe('USR-000099')
    expect(formatUserCode(123)).toBe('USR-000123')
    expect(formatUserCode(999999)).toBe('USR-999999')
  })

  it('handles edge cases', () => {
    expect(formatUserCode(0)).toBe('USR-000000')
    expect(formatUserCode(1000000)).toBe('USR-1000000') // Exceeds 6 digits
  })

  it('throws error for invalid input', () => {
    expect(() => formatUserCode(-1)).toThrow()
    expect(() => formatUserCode('abc')).toThrow()
    expect(() => formatUserCode(null)).toThrow()
  })
})

describe('isUserCode', () => {
  it('validates correct USR format', () => {
    expect(isUserCode('USR-000001')).toBe(true)
    expect(isUserCode('USR-000999')).toBe(true)
    expect(isUserCode('USR-999999')).toBe(true)
  })

  it('rejects incorrect formats', () => {
    expect(isUserCode('USR-00001')).toBe(false)   // Too few digits
    expect(isUserCode('USR-0000001')).toBe(false)  // Too many digits
    expect(isUserCode('USRE-000001')).toBe(false)  // Wrong prefix
    expect(isUserCode('usr-000001')).toBe(false)   // Lowercase
    expect(isUserCode('000001')).toBe(false)       // No prefix
    expect(isUserCode('')).toBe(false)
    expect(isUserCode(null)).toBe(false)
    expect(isUserCode(undefined)).toBe(false)
  })

  it('handles non-string input gracefully', () => {
    expect(isUserCode(123)).toBe(false)
    expect(isUserCode({})).toBe(false)
    expect(isUserCode([])).toBe(false)
  })
})
