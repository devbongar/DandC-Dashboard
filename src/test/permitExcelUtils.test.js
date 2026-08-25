import { describe, it, expect } from 'vitest'
import {
  formatDateForExcel,
  parseDateFromExcel,
  exportPermitsToSheet,
  parsePermitImportSheet,
  validatePermitImportSheet,
} from '../lib/permitExcelUtils'

// ─── formatDateForExcel ───────────────────────────────────────────────────────

describe('formatDateForExcel', () => {
  it('converts YYYY-MM-DD to MM/DD/YYYY', () => {
    expect(formatDateForExcel('2025-03-15')).toBe('03/15/2025')
  })

  it('pads single-digit month and day', () => {
    expect(formatDateForExcel('2025-01-05')).toBe('01/05/2025')
  })

  it('returns empty string for null', () => {
    expect(formatDateForExcel(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatDateForExcel(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(formatDateForExcel('')).toBe('')
  })
})

// ─── parseDateFromExcel ───────────────────────────────────────────────────────

describe('parseDateFromExcel', () => {
  it('converts MM/DD/YYYY to YYYY-MM-DD', () => {
    expect(parseDateFromExcel('03/15/2025')).toBe('2025-03-15')
  })

  it('pads single-digit month and day', () => {
    expect(parseDateFromExcel('01/05/2025')).toBe('2025-01-05')
  })

  it('accepts single-digit month and day', () => {
    expect(parseDateFromExcel('5/1/2026')).toBe('2026-05-01')
  })

  it('accepts JS Date object (cellDates: true)', () => {
    expect(parseDateFromExcel(new Date(Date.UTC(2026, 4, 1)))).toBe('2026-05-01')
  })

  it('accepts Excel serial number', () => {
    // 46113 = 2026-03-15 in Excel serial
    const serial = 46113
    const result = parseDateFromExcel(serial)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns null for empty string', () => {
    expect(parseDateFromExcel('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(parseDateFromExcel(null)).toBeNull()
  })

  it('returns null for invalid format', () => {
    expect(parseDateFromExcel('not-a-date')).toBeNull()
  })

  it('returns null for partial date', () => {
    expect(parseDateFromExcel('03-2025')).toBeNull()
  })
})

// ─── exportPermitsToSheet ─────────────────────────────────────────────────────

describe('exportPermitsToSheet', () => {
  const permits = [
    {
      id: 'PRM-001',
      name: 'Building Permit',
      projects: { name: 'Tower A' },
      planned_start:   '2025-01-01',
      planned_finish:  '2025-06-30',
      actual_start:    '2025-01-10',
      actual_finish:   null,
      forecast_start:  '2025-01-10',
      forecast_finish: '2025-07-15',
    },
  ]

  it('returns array with header row + data rows', () => {
    const rows = exportPermitsToSheet(permits)
    expect(rows).toHaveLength(2)
  })

  it('header row has correct columns', () => {
    const [header] = exportPermitsToSheet(permits)
    expect(header).toEqual([
      'Permit ID', 'Permit Name', 'Project',
      'Planned Start', 'Planned End',
      'Actual Start', 'Actual End',
      'Forecast Start', 'Forecast End',
    ])
  })

  it('data row formats dates as MM/DD/YYYY', () => {
    const [, row] = exportPermitsToSheet(permits)
    expect(row[3]).toBe('01/01/2025') // planned_start
    expect(row[4]).toBe('06/30/2025') // planned_finish
    expect(row[5]).toBe('01/10/2025') // actual_start
  })

  it('null date becomes empty string in export', () => {
    const [, row] = exportPermitsToSheet(permits)
    expect(row[6]).toBe('') // actual_finish is null
  })

  it('includes permit id, name, project', () => {
    const [, row] = exportPermitsToSheet(permits)
    expect(row[0]).toBe('PRM-001')
    expect(row[1]).toBe('Building Permit')
    expect(row[2]).toBe('Tower A')
  })

  it('handles missing project gracefully', () => {
    const rows = exportPermitsToSheet([{ ...permits[0], projects: null }])
    expect(rows[1][2]).toBe('')
  })
})

// ─── validatePermitImportSheet ────────────────────────────────────────────────

describe('validatePermitImportSheet', () => {
  const header = ['Permit ID', 'Permit Name', 'Project', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Forecast Start', 'Forecast End']
  const existingIds = new Set(['PRM-001', 'PRM-002'])

  it('marks row valid when ID exists and dates valid', () => {
    const rows = [header, ['PRM-001', 'Permit', 'Proj', '01/01/2025', '', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(1)
    expect(skipped).toHaveLength(0)
    expect(valid[0].id).toBe('PRM-001')
  })

  it('skips row with no Permit ID', () => {
    const rows = [header, ['', 'Permit', 'Proj', '01/01/2025', '', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(0)
    expect(skipped[0].reason).toBe('No Permit ID')
  })

  it('skips row when Permit ID not found', () => {
    const rows = [header, ['PRM-999', 'Permit', 'Proj', '01/01/2025', '', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(0)
    expect(skipped[0].reason).toBe('Permit ID not found')
  })

  it('skips row with invalid date format', () => {
    const rows = [header, ['PRM-001', 'Permit', 'Proj', '2025-01-01', '', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(0)
    expect(skipped[0].reason).toMatch(/Invalid date/)
  })

  it('includes field name in invalid date reason', () => {
    const rows = [header, ['PRM-001', 'Permit', 'Proj', '', '13/45/2025', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(skipped[0].reason).toMatch(/Planned End/)
  })

  it('allows empty date fields', () => {
    const rows = [header, ['PRM-001', 'Permit', 'Proj', '', '', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(1)
    expect(skipped).toHaveLength(0)
  })

  it('returns skipped row with permit name and id for display', () => {
    const rows = [header, ['PRM-999', 'My Permit', 'Proj', '', '', '', '', '', '']]
    const { skipped } = validatePermitImportSheet(rows, existingIds)
    expect(skipped[0].permitId).toBe('PRM-999')
    expect(skipped[0].permitName).toBe('My Permit')
  })

  it('returns valid row with parsed date fields', () => {
    const rows = [header, ['PRM-001', 'Permit', 'Proj', '03/15/2025', '', '', '', '', '']]
    const { valid } = validatePermitImportSheet(rows, existingIds)
    expect(valid[0].planned_start).toBe('2025-03-15')
  })

  it('handles multiple rows mixed valid and skipped', () => {
    const rows = [
      header,
      ['PRM-001', 'Permit 1', 'Proj', '01/01/2025', '', '', '', '', ''],
      ['PRM-999', 'Permit 2', 'Proj', '', '', '', '', '', ''],
      ['PRM-002', 'Permit 3', 'Proj', '', '06/30/2025', '', '', '', ''],
    ]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(2)
    expect(skipped).toHaveLength(1)
  })

  it('returns empty arrays for header-only sheet', () => {
    const { valid, skipped } = validatePermitImportSheet([header], existingIds)
    expect(valid).toHaveLength(0)
    expect(skipped).toHaveLength(0)
  })

  it('accepts Date objects in date cells (cellDates: true)', () => {
    const rows = [header, ['PRM-001', 'Permit', 'Proj', new Date(Date.UTC(2026, 4, 1)), '', '', '', '', '']]
    const { valid, skipped } = validatePermitImportSheet(rows, existingIds)
    expect(valid).toHaveLength(1)
    expect(skipped).toHaveLength(0)
    expect(valid[0].planned_start).toBe('2026-05-01')
  })
})

// ─── parsePermitImportSheet ───────────────────────────────────────────────────

describe('parsePermitImportSheet', () => {
  const header = ['Permit ID', 'Permit Name', 'Project', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Forecast Start', 'Forecast End']

  it('parses valid rows into permit update objects', () => {
    const rows = [
      header,
      ['PRM-001', 'Building Permit', 'Tower A', '01/01/2025', '06/30/2025', '01/10/2025', '', '01/10/2025', '07/15/2025'],
    ]
    const result = parsePermitImportSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id:              'PRM-001',
      planned_start:   '2025-01-01',
      planned_finish:  '2025-06-30',
      actual_start:    '2025-01-10',
      actual_finish:   null,
      forecast_start:  '2025-01-10',
      forecast_finish: '2025-07-15',
    })
  })

  it('skips rows with no permit ID', () => {
    const rows = [
      header,
      ['', 'No ID permit', 'Tower A', '01/01/2025', '06/30/2025', '', '', '', ''],
    ]
    expect(parsePermitImportSheet(rows)).toHaveLength(0)
  })

  it('returns empty string date cell as null', () => {
    const rows = [
      header,
      ['PRM-002', 'Permit', 'Proj', '', '06/30/2025', '', '', '', ''],
    ]
    const [result] = parsePermitImportSheet(rows)
    expect(result.planned_start).toBeNull()
  })

  it('returns null for invalid date string', () => {
    const rows = [
      header,
      ['PRM-003', 'Permit', 'Proj', 'bad-date', '06/30/2025', '', '', '', ''],
    ]
    const [result] = parsePermitImportSheet(rows)
    expect(result.planned_start).toBeNull()
  })

  it('handles multiple rows', () => {
    const rows = [
      header,
      ['PRM-001', 'Permit 1', 'Proj', '01/01/2025', '06/30/2025', '', '', '', ''],
      ['PRM-002', 'Permit 2', 'Proj', '02/01/2025', '07/31/2025', '', '', '', ''],
    ]
    expect(parsePermitImportSheet(rows)).toHaveLength(2)
  })

  it('returns empty array for header-only sheet', () => {
    expect(parsePermitImportSheet([header])).toHaveLength(0)
  })
})
