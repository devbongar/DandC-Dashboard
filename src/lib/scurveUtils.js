export function parsePeriodDate(val) {
  if (!val) return null

  // JS Date object -- from Excel with cellDates:true
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getFullYear()
    const m = val.getMonth() + 1
    return `${y}-${String(m).padStart(2, '0')}-01`
  }

  const s = String(val).trim()
  if (!s) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7) + '-01'

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s + '-01'

  // "Jan '26" -- short month + apostrophe + 2-digit year
  const shortMatch = s.match(/^([A-Za-z]{3})\s+'(\d{2})$/)
  if (shortMatch) {
    const fullYear = 2000 + parseInt(shortMatch[2], 10)
    const d = new Date(`${shortMatch[1]} 1 ${fullYear}`)
    if (!isNaN(d.getTime())) {
      return `${fullYear}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    }
    return null
  }

  // "January 2026" -- full or short month + 4-digit year
  const longMatch = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (longMatch) {
    const d = new Date(`${longMatch[1]} 1 ${longMatch[2]}`)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      if (y >= 1900 && y <= 2100) return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    }
    return null
  }

  // m/d/yyyy or mm/dd/yyyy
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdyMatch) {
    const m = parseInt(mdyMatch[1], 10)
    const y = parseInt(mdyMatch[3], 10)
    if (m >= 1 && m <= 12 && y >= 1900 && y <= 2100)
      return `${y}-${String(m).padStart(2, '0')}-01`
    return null
  }

  return null
}

export function detectConflicts(importedRows, baselineMap) {
  const conflicts = []
  const newRows   = []
  for (const row of importedRows) {
    const existing = baselineMap[row.period_date]
    if (existing && (existing.planned_pct ?? 0) > 0) {
      conflicts.push({ ...row, existing_pct: existing.planned_pct })
    } else {
      newRows.push(row)
    }
  }
  return { conflicts, newRows }
}

export const formatPeriod = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  const yr  = String(d.getFullYear()).slice(2)
  return `${mon} '${yr}`
}

// Returns { building_id: uuid | null } -- spread into inserts, use for query filters.
// All three scurve tables share this shape: NULL = project scope, UUID = tower scope.
export function getScopeFilter(buildingId) {
  return { building_id: buildingId ?? null }
}

export function buildAllPeriods(baselineData, actuals, forecasts) {
  const set = new Set([
    ...baselineData.map(r => r.period_date),
    ...actuals.map(r => r.period_date),
    ...forecasts.map(r => r.period_date),
  ])
  return [...set].sort()
}

export function computeChartData(periods, baselineData, actuals, forecasts) {
  if (!periods.length) return []

  const baselineMap = Object.fromEntries(baselineData.map(r => [r.period_date, r]))
  const actualMap   = Object.fromEntries(actuals.map(r => [r.period_date, r]))
  const forecastMap = Object.fromEntries(forecasts.map(r => [r.period_date, r]))

  const lastBaselineIdx = periods.reduce((last, p, i) => (baselineMap[p]?.planned_pct ?? 0) > 0 ? i : last, -1)
  const lastActualIdx   = periods.reduce((last, p, i) => (actualMap[p]?.actual_pct ?? 0)    > 0 ? i : last, -1)
  const lastForecastIdx = periods.reduce((last, p, i) => {
    const hasA = (actualMap[p]?.actual_pct ?? 0) > 0
    const hasF = (forecastMap[p]?.forecast_pct ?? 0) > 0
    return (hasA || hasF) ? i : last
  }, -1)

  let cumBaseline = 0, cumActual = 0, cumForecast = 0

  return periods.map((p, i) => {
    const bPct = baselineMap[p]?.planned_pct ?? 0
    const aPct = actualMap[p]?.actual_pct    ?? 0
    const fPct = forecastMap[p]?.forecast_pct ?? 0

    if (bPct > 0) cumBaseline = Math.min(100, cumBaseline + bPct)
    if (aPct > 0) { cumActual = Math.min(100, cumActual + aPct); cumForecast = cumActual }
    else if (fPct > 0) cumForecast = Math.min(100, cumForecast + fPct)

    return {
      period:   formatPeriod(p),
      baseline: (bPct > 0 && i <= lastBaselineIdx)           ? cumBaseline  : null,
      actual:   (aPct > 0 && i <= lastActualIdx)             ? cumActual    : null,
      forecast: (i <= lastForecastIdx && (aPct > 0 || fPct > 0 || cumForecast > 0 && i <= lastForecastIdx))
                  ? cumForecast : null,
      _date:    p,
    }
  })
}
