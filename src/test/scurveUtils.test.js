import { describe, it, expect } from 'vitest'
import { buildAllPeriods, computeChartData } from '../lib/scurveUtils'

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
