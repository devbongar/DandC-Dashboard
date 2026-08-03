import { describe, it, expect } from 'vitest'
import { buildAllPeriods, computeChartData, parsePeriodDate, detectConflicts, getScopeFilter } from '../lib/scurveUtils'

describe('buildAllPeriods', () => {
  it('returns union of baseline, actual, forecast periods sorted', () => {
    const baseline = [{ period_date: '2026-03-01' }, { period_date: '2026-01-01' }]
    const actuals  = [{ period_date: '2026-02-01' }]
    const forecast = [{ period_date: '2026-04-01' }]
    expect(buildAllPeriods(baseline, actuals, forecast)).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
    ])
  })

  it('deduplicates overlapping periods', () => {
    const baseline = [{ period_date: '2026-01-01' }]
    const actuals  = [{ period_date: '2026-01-01' }]
    expect(buildAllPeriods(baseline, actuals, [])).toEqual(['2026-01-01'])
  })

  it('returns empty array when all inputs empty', () => {
    expect(buildAllPeriods([], [], [])).toEqual([])
  })
})

describe('computeChartData', () => {
  const periods = ['2026-01-01', '2026-02-01', '2026-03-01']

  it('computes cumulative baseline', () => {
    const baseline = [
      { period_date: '2026-01-01', planned_pct: 10 },
      { period_date: '2026-02-01', planned_pct: 20 },
      { period_date: '2026-03-01', planned_pct: 30 },
    ]
    const result = computeChartData(periods, baseline, [], [])
    expect(result[0].baseline).toBe(10)
    expect(result[1].baseline).toBe(30)
    expect(result[2].baseline).toBe(60)
  })

  it('computes cumulative actual', () => {
    const actuals = [
      { period_date: '2026-01-01', actual_pct: 10 },
      { period_date: '2026-02-01', actual_pct: 15 },
    ]
    const result = computeChartData(periods, [], actuals, [])
    expect(result[0].actual).toBe(10)
    expect(result[1].actual).toBe(25)
    expect(result[2].actual).toBeNull()
  })

  it('forecast continues from last actual cumulative', () => {
    const actuals  = [
      { period_date: '2026-01-01', actual_pct: 10 },
      { period_date: '2026-02-01', actual_pct: 15 },
    ]
    const forecast = [{ period_date: '2026-03-01', forecast_pct: 20 }]
    const result   = computeChartData(periods, [], actuals, forecast)
    expect(result[2].forecast).toBe(45) // 25 (cumActual) + 20
    expect(result[2].actual).toBeNull()
  })

  it('forecast line carries through actual periods (so chart connects)', () => {
    const actuals  = [{ period_date: '2026-01-01', actual_pct: 10 }]
    const forecast = [{ period_date: '2026-03-01', forecast_pct: 20 }]
    const result   = computeChartData(periods, [], actuals, forecast)
    expect(result[0].forecast).toBe(10) // equals actual in actual periods
    expect(result[2].forecast).toBe(30) // 10 + 20
  })

  it('caps cumulative baseline at 100', () => {
    const baseline = [
      { period_date: '2026-01-01', planned_pct: 60 },
      { period_date: '2026-02-01', planned_pct: 60 },
    ]
    const result = computeChartData(['2026-01-01', '2026-02-01'], baseline, [], [])
    expect(result[1].baseline).toBe(100)
  })

  it('caps cumulative actual at 100', () => {
    const actuals = [
      { period_date: '2026-01-01', actual_pct: 80 },
      { period_date: '2026-02-01', actual_pct: 40 },
    ]
    const result = computeChartData(['2026-01-01', '2026-02-01'], [], actuals, [])
    expect(result[1].actual).toBe(100)
  })

  it('returns null baseline for periods beyond last baseline entry', () => {
    const baseline = [{ period_date: '2026-01-01', planned_pct: 10 }]
    const result   = computeChartData(periods, baseline, [], [])
    expect(result[1].baseline).toBeNull()
    expect(result[2].baseline).toBeNull()
  })

  it('attaches _date and period label to each entry', () => {
    const baseline = [{ period_date: '2026-01-01', planned_pct: 10 }]
    const result   = computeChartData(['2026-01-01'], baseline, [], [])
    expect(result[0]._date).toBe('2026-01-01')
    expect(typeof result[0].period).toBe('string')
    expect(result[0].period.length).toBeGreaterThan(0)
  })

  it('returns empty array for empty periods', () => {
    expect(computeChartData([], [], [], [])).toEqual([])
  })
})

describe('parsePeriodDate', () => {
  it('parses YYYY-MM-DD to first of month', () => {
    expect(parsePeriodDate('2026-03-15')).toBe('2026-03-01')
  })

  it('parses YYYY-MM to first of month', () => {
    expect(parsePeriodDate('2026-03')).toBe('2026-03-01')
  })

  it("parses 'Jan \\u002726' label format", () => {
    expect(parsePeriodDate("Jan '26")).toBe('2026-01-01')
  })

  it('parses full month name and year', () => {
    expect(parsePeriodDate('March 2026')).toBe('2026-03-01')
  })

  it('returns null for empty input', () => {
    expect(parsePeriodDate('')).toBeNull()
    expect(parsePeriodDate(null)).toBeNull()
    expect(parsePeriodDate(undefined)).toBeNull()
  })

  it('handles JS Date objects (from Excel cellDates:true)', () => {
    expect(parsePeriodDate(new Date('2026-01-15'))).toBe('2026-01-01')
    expect(parsePeriodDate(new Date('2026-12-01'))).toBe('2026-12-01')
  })

  it('parses m/d/yyyy format to first of month', () => {
    expect(parsePeriodDate('1/1/2026')).toBe('2026-01-01')
    expect(parsePeriodDate('12/15/2026')).toBe('2026-12-01')
    expect(parsePeriodDate('3/1/2026')).toBe('2026-03-01')
  })

  it('returns null for unrecognized format', () => {
    expect(parsePeriodDate('not-a-date')).toBeNull()
  })
})

describe('detectConflicts', () => {
  const baselineMap = {
    '2026-01-01': { planned_pct: 10 },
    '2026-02-01': { planned_pct: 0 },
    '2026-03-01': { planned_pct: null },
  }

  it('separates new rows from conflicting rows', () => {
    const rows = [
      { period_date: '2026-01-01', planned_pct: 15 }, // conflict
      { period_date: '2026-04-01', planned_pct: 20 }, // new
    ]
    const { conflicts, newRows } = detectConflicts(rows, baselineMap)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].period_date).toBe('2026-01-01')
    expect(conflicts[0].existing_pct).toBe(10)
    expect(newRows).toHaveLength(1)
    expect(newRows[0].period_date).toBe('2026-04-01')
  })

  it('treats zero planned_pct as non-conflict', () => {
    const rows = [{ period_date: '2026-02-01', planned_pct: 5 }]
    const { conflicts, newRows } = detectConflicts(rows, baselineMap)
    expect(conflicts).toHaveLength(0)
    expect(newRows).toHaveLength(1)
  })

  it('treats null planned_pct as non-conflict', () => {
    const rows = [{ period_date: '2026-03-01', planned_pct: 5 }]
    const { conflicts, newRows } = detectConflicts(rows, baselineMap)
    expect(conflicts).toHaveLength(0)
    expect(newRows).toHaveLength(1)
  })

  it('returns all as new when baselineMap is empty', () => {
    const rows = [
      { period_date: '2026-01-01', planned_pct: 10 },
      { period_date: '2026-02-01', planned_pct: 20 },
    ]
    const { conflicts, newRows } = detectConflicts(rows, {})
    expect(conflicts).toHaveLength(0)
    expect(newRows).toHaveLength(2)
  })
})

describe('getScopeFilter', () => {
  it('returns building_id null for project scope', () => {
    expect(getScopeFilter(null)).toEqual({ building_id: null })
    expect(getScopeFilter(undefined)).toEqual({ building_id: null })
  })

  it('returns building_id uuid for tower scope', () => {
    expect(getScopeFilter('building-uuid-123')).toEqual({ building_id: 'building-uuid-123' })
  })
})
